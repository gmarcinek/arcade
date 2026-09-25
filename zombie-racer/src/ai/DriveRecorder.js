// Nagrywa jazdę do treningu sieci NPC. Dwa źródła:
//  • gracz — etykiety "po fakcie": gdy zdobędzie czas, próbki z ostatnich sekund dostają cel
//    (to, w co trafił) i wagę = nagroda × zanik w czasie;
//  • klasyczne NPC w ataku — każda próbka dostaje zwrot (sumę zdyskontowanych nagród z kolejnych
//    sekund): zbliżanie się do gracza, obrażenia zadane graczowi, kara za własne obrażenia,
//    uderzenia w przeszkody i śmierć. W treningu zwrot → waga (advantage-weighted regression).
import {
  carPose, egoFeatures, targetFeatures, attitudeFeatures, perceiveTarget, createTargetMemory, isSteerable,
  FEATURE_COUNT, FEATURE_NAMES, ACTION_NAMES, EGO_COUNT, FEATURE_VERSION,
} from './features.js';

const SAMPLE_DT     = 0.1;   // s — 10 Hz
const HISTORY_S     = 6;     // ile sekund wstecz trzymamy nieoznaczone próbki gracza
const CREDIT_WINDOW = 5;     // s przed zdarzeniem, które dostają nagrodę
const CREDIT_DECAY  = 2;     // s — stała zaniku wagi
const BAD_WINDOW    = 1.0;   // s przed utratą HP, które wykluczamy
const DEATH_WINDOW  = 3.0;
const RESPAWN_WINDOW = 3.0;  // s przed respawnem (zwykle utknięcie/przewrotka) — wykluczone
const RESPAWN_PAUSE  = 1.5;  // s po respawnie bez nagrywania (auto opada i się stabilizuje)
const HEAL_WINDOW    = 1.0;
const HEAL_PAUSE     = 1.0;
const NPC_HORIZON   = 5;     // s — horyzont zwrotu NPC
const NPC_DECAY     = 2;     // s — dyskonto nagród NPC
const APPROACH_SCALE = 40;   // m zbliżenia = +1 nagrody
// Nagrody NPC (ułamki HP liczone względem maxHp danej strony):
const R_DMG_DEALT   = 20;    // × ułamek HP gracza zabrany przy zderzeniu
const R_DMG_TAKEN   = 20;    // × ułamek własnego HP straconego przy zderzeniu
const R_OBSTACLE    = 1.5;   // × (prędkość/10 m/s)² za uderzenie w budynek/drzewo
const R_OBSTACLE_MAX = 6;
const R_DEATH       = 10;
const FLUSH_EVERY   = 20;    // s
const ENDPOINT      = '/__ai/record';

const round3 = v => Math.round(v * 1000) / 1000;

export class DriveRecorder {
  constructor() {
    this._t = 0;
    this._acc = 0;
    this._npcAcc = 0;
    this._history = [];
    this._rows = [];
    this._npcRows = [];
    this._npc = new Map();
    this._lastHp = null;
    this._pauseUntil = 0;
    this._flushTimer = 0;
    this._pose = {};
    this.totalRows = 0;
    window.addEventListener('pagehide', () => this.flush(true));
  }

  tick(dt, player, input, npcCars, inactive) {
    this._t += dt;
    this._flushTimer += dt;
    if (this._flushTimer > FLUSH_EVERY) {
      this._flushTimer = 0;
      this.flush();
    }
    if (inactive || !player.chassisBody || this._t < this._pauseUntil) {
      this._lastHp = null;
      return;
    }

    if (this._lastHp !== null && this._lastHp - player.hp > 2) this._markBad(BAD_WINDOW);
    this._lastHp = player.hp;

    this._acc += dt;
    if (this._acc < SAMPLE_DT) return;
    this._acc = 0;

    const pose = carPose(player, this._pose);
    if (!isSteerable(pose)) return;
    const ego = egoFeatures(pose, player.hp / player.maxHp, new Array(EGO_COUNT), 0);
    const att = attitudeFeatures(pose, new Array(4), 0);
    const npcs = npcCars.map(n => n.chassisBody && n.isAlive
      ? [n.chassisBody.position.x, n.chassisBody.position.z, n.chassisBody.velocity.x, n.chassisBody.velocity.z]
      : null);
    this._history.push({
      t: this._t,
      pose: { x: pose.x, z: pose.z, heading: pose.heading, vx: pose.vx, vz: pose.vz },
      ego,
      att,
      action: [player._steerSmooth, input.throttle, input.brake ? 1 : 0, player.boostActive ? 1 : 0],
      npcs,
      bad: false,
    });
    while (this._history.length && this._t - this._history[0].t > HISTORY_S) this._history.shift();
  }

  // target: { npcIndex } dla auta lub { x, z } dla zombie
  reward(target, amount) {
    if (amount <= 0) return;
    // Widzenie celu odtwarzamy chronologicznie, żeby pamięć o celu była taka, jaką miałby NPC.
    const mem = createTargetMemory();
    for (const s of this._history) {
      let tx, tz, tvx = 0, tvz = 0;
      if (target.npcIndex !== undefined) {
        const n = s.npcs[target.npcIndex];
        if (!n) continue;
        [tx, tz, tvx, tvz] = n;
      } else {
        tx = target.x; tz = target.z;
      }
      const visible = perceiveTarget(s.pose, tx, tz, tvx, tvz, mem, s.t);
      const age = this._t - s.t;
      if (s.bad || age > CREDIT_WINDOW) continue;
      const feat = new Array(FEATURE_COUNT);
      for (let i = 0; i < EGO_COUNT; i++) feat[i] = s.ego[i];
      targetFeatures(s.pose, mem, visible, s.t, feat);
      attitudeFeatures({ upY: s.att[0], roll: s.att[1], pitch: s.att[2], wheels: s.att[3] }, feat);
      const w = amount * Math.exp(-age / CREDIT_DECAY);
      this._rows.push([...feat, ...s.action, w].map(round3));
    }
  }

  // Próbki klasycznych NPC, które akurat atakują gracza.
  tickNpcs(dt, npcCars, player, playerActive) {
    this._npcAcc += dt;
    if (this._npcAcc >= SAMPLE_DT) {
      this._npcAcc = 0;
      const pp = player.chassisBody?.position;
      for (const npc of npcCars) {
        if (!playerActive || !pp || !npc.isAlive || !npc.chassisBody || !npc.isAttacking || !npc._lastControl) continue;
        let h = this._npc.get(npc);
        if (!h) { h = { samples: [], lastDist: null }; this._npc.set(npc, h); }
        const pose = carPose(npc, {});
        const dist = Math.hypot(pp.x - pose.x, pp.z - pose.z);
        const closing = h.lastDist !== null && Math.abs(h.lastDist - dist) < 30 ? h.lastDist - dist : 0;
        h.lastDist = dist;
        if (!isSteerable(pose)) continue;
        const feat = new Array(FEATURE_COUNT);
        egoFeatures(pose, npc.hp / npc.maxHp, feat, 0);
        targetFeatures(pose, npc._tgtMem, npc._tgtVisible, npc._clock, feat);
        attitudeFeatures(pose, feat);
        h.samples.push({ t: this._t, row: [...feat, ...npc._lastControl], r: closing / APPROACH_SCALE });
      }
    }
    for (const h of this._npc.values()) {
      while (h.samples.length && this._t - h.samples[0].t > NPC_HORIZON) {
        const s = h.samples.shift();
        let ret = s.r;
        for (const o of h.samples) {
          if (o.t - s.t > NPC_HORIZON) break;
          ret += o.r * Math.exp(-(o.t - s.t) / NPC_DECAY);
        }
        this._npcRows.push([...s.row, ret].map(round3));
      }
    }
  }

  // Nagroda/kara dla NPC — trafia do najnowszej próbki, zwrot rozkłada ją na wcześniejsze.
  npcReward(npc, amount) {
    const h = this._npc.get(npc);
    const last = h?.samples[h.samples.length - 1];
    if (last && this._t - last.t < 1) last.r += amount;
  }

  // Im mocniejsze zderzenie (prędkość, pęd), tym większe obrażenia obu stron — liczy się bilans.
  onNpcClash(npc, dmgToPlayer, dmgToNpc, playerMaxHp) {
    this.npcReward(npc, R_DMG_DEALT * dmgToPlayer / playerMaxHp - R_DMG_TAKEN * dmgToNpc / npc.maxHp);
  }

  onNpcObstacle(npc, impactSpeed) {
    this.npcReward(npc, -Math.min(R_OBSTACLE_MAX, R_OBSTACLE * (impactSpeed / 10) ** 2));
  }

  onNpcDeath(npc) {
    this.npcReward(npc, -R_DEATH);
  }

  onDeath() {
    this._markBad(DEATH_WINDOW);
  }

  // Insert/Home/auto-respawn/respawn po śmierci — NPC tego nie umieją, więc nie uczymy z tych chwil.
  onRespawn() {
    this._markBad(RESPAWN_WINDOW);
    this._pauseUntil = this._t + RESPAWN_PAUSE;
  }

  onHeal() {
    this._markBad(HEAL_WINDOW);
    this._pauseUntil = Math.max(this._pauseUntil, this._t + HEAL_PAUSE);
  }

  _markBad(seconds) {
    for (const s of this._history) if (this._t - s.t <= seconds) s.bad = true;
  }

  flush(unloading = false) {
    this._send('player', this._rows, unloading);
    this._send('npc', this._npcRows, unloading);
    this._rows = [];
    this._npcRows = [];
  }

  _send(source, rows, unloading) {
    if (!rows.length) return;
    const body = JSON.stringify({
      version: FEATURE_VERSION,
      source,
      featureCount: FEATURE_COUNT,
      featureNames: FEATURE_NAMES,
      actionNames: ACTION_NAMES,
      rows,
    });
    this.totalRows += rows.length;
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: unloading })
      .catch(e => console.warn('[AI] zapis nagrania nieudany:', e));
  }
}
