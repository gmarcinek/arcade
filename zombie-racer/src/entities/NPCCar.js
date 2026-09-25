import * as THREE from 'three';
import { Car } from '../car/Car.js';
import { WORLD_SIZE } from '../constants.js';
import { SOFT_BOUNDS, insideObstacle, gatherStatic, rayDist } from '../ai/sensors.js';
import { carPose, egoFeatures, targetFeatures, attitudeFeatures, perceiveTarget, createTargetMemory,
         FEATURE_COUNT, MEMORY_S, VIEW_DIST } from '../ai/features.js';

const NPC_MAX_HP       = 850;
const NPC_BOUNDS       = WORLD_SIZE / 2 - 5;
const MAX_ATTACKERS    = 3;     // ilu NPC naraz może polować na gracza
const CRUISE_SPEED     = 17;    // m/s
const HUNT_SPEED       = 30;    // m/s
const RAM_THROTTLE     = 1.3;
const RAM_DIST         = 32;    // m — od tej odległości NPC idzie na taran
const RAM_ALIGN        = 0.3;   // rad — wymagane ustawienie na cel przed taranem
const HIT_DIST         = 5.5;   // m — odległość środków uznawana za trafienie
const FLEE_HP_RATIO    = 0.3;
const STUCK_TIME       = 1.0;   // s bez ruchu mimo gazu → cofanie
const REVERSE_THROTTLE = 0.85;
const STEER_P          = 1.7;
const STEER_D          = 0.3;
const STEER_RATE       = 4.0;   // max zmiana sterowania na sekundę
const LOOK_MIN         = 12;
const LOOK_MAX         = 45;
const CAR_AVOID_HALF   = 3.2;
const FLIP_RESET_TIME  = 2.5;
const LEARNED_STUCK_RESPAWN = 8; // s bez ruchu w trybie sieci → cichy respawn (gdy gracz daleko)
const PROBE_OFFSETS    = [0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75];

const State = { CRUISE: 0, HUNT: 1, RAM: 2, BACKOFF: 3, FLEE: 4 };

function _wrap(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class NPCCar extends Car {
  /** @type {import('../ai/PolicyNet.js').PolicyNet|null} gdy ustawione — wszyscy NPC jeżdżą siecią */
  static policy = null;

  constructor(waypointRoute, color = 0xcc2200) {
    super({ stats: { engine: 0.8, defence: 0.7, offence: 0.7 } });
    const reachable = waypointRoute.filter(wp => !insideObstacle(wp.x, wp.z));
    this.waypointRoute  = reachable.length ? reachable : waypointRoute;
    this.waypointIdx    = 0;
    this.npcColor       = color;
    this.hp             = NPC_MAX_HP;
    this.maxHp          = NPC_MAX_HP;
    this._near          = [];
    this._carBoxes      = [];
    this._feat          = new Float32Array(FEATURE_COUNT);
    this._pose          = {};
    this._resetAI();
    this._smokeTimer    = Math.random() * 0.5;
    this.onSmoke        = null; // callback(x, y, z, type)
    this._smokeOffset   = new THREE.Vector3();
    this.onFireExplode   = null; // callback() — 1s po wejściu w fazę ogień
    this.onBoundsExit    = null; // callback(npc) — wyjechał poza planszę → cichy respawn
    this._fireTimer      = 0;   // 0=nie startował; >0=odliczanie; 2=wybuchło
    this._isDying        = false;
    this._dyingTimer     = 0;   // akumulowany czas od śmierci
    this._dyingExplodeAt = 0;   // losowe 1-1.5s, ustawiane przy _isDying=true
    this.onDyingExplode  = null; // callback(npc, velX, velY, velZ)
  }

  _resetAI() {
    this._steerSmooth    = 0;
    this._state          = State.CRUISE;
    this._stateTime      = 0;
    this._maneuver       = null;  // { type: 'reverse' | 'turn', t, dur, steer }
    this._stuckTimer     = 0;
    this._stuckCount     = 0;
    this._flipTimer      = 0;
    this._wpTimer        = 0;
    this._attackCooldown = 1 + Math.random() * 3;
    this._avoidSide      = 0;
    this._lastThrottle   = 0;
    this._backoffDur     = 0;
    this._aggression     = 0.45 + Math.random() * 0.55;
    this._skill          = 0.85 + Math.random() * 0.25;
    this._detectRange    = Math.min(VIEW_DIST, 80 + 70 * this._aggression);
    this._clock          = 0;
    this._tgtMem         = createTargetMemory(); // gdzie ostatnio widział gracza
    this._tgtVisible     = false;
    this._wpMem          = createTargetMemory();
    this._lastControl    = null; // [steer, throttle, brake, boost] — do nagrań
  }

  get isAttacking() {
    return !NPCCar.policy && (this._state === State.HUNT || this._state === State.RAM || this._state === State.BACKOFF);
  }

  buildNPC(scene, world, terrain) {
    const spawn = this.waypointRoute[this.waypointIdx % this.waypointRoute.length];
    const hy = terrain.getHeightAt(spawn.x, spawn.z) + 2.5;
    this.build(scene, world, spawn.x, hy, spawn.z, this.npcColor);
  }

  // Odrodzenie po wybuchu — czyści stary stan, buduje na nowo
  respawn(scene, world, terrain) {
    // Usuń stare obiekty z silnika fizyki / sceny
    if (this.vehicle)    { try { this.vehicle.removeFromWorld(world); } catch(_) {} }
    if (this.chassisBody){ try { world.removeBody(this.chassisBody); }   catch(_) {} }
    for (const wm of this.wheelMeshes) { scene.remove(wm); }
    scene.remove(this.group);

    // Utwórz nowe grupy (build() wymaga świeżych obiektów Three.js)
    this.group        = new THREE.Group();
    this.wheelMeshes  = [];
    this.chassisMesh  = null;
    this.vehicle      = null;
    this.chassisBody  = null;

    // Reset stanu
    this.hp             = NPC_MAX_HP;
    this.isAlive        = true;
    this._isDying       = false;
    this._dyingTimer    = 0;
    this._dyingExplodeAt = 0;
    this.onDyingExplode = null;
    this.onBoundsExit   = null;
    this._fireTimer     = 0;
    this._resetAI();
    this._throttleFiltered = 0;
    this._wobbleTime    = 0;
    this._wheelDetached = [false, false, false, false];
    this._detachedWheelState = [null, null, null, null];
    for (const k of Object.keys(this.damageSystem.state)) this.damageSystem.state[k] = 0;
    // Losowy punkt trasy jako spawn
    this.waypointIdx = Math.floor(Math.random() * this.waypointRoute.length);
    this._ghostTimer   = 0;

    this.buildNPC(scene, world, terrain);
  }

  update(terrain, playerPos, playerVel, allNpcs, dt = 1 / 60, playerActive = true) {
    if (!this.isAlive || !this.vehicle) return;

    const body = this.chassisBody;
    const pos  = body.position;

    if (Math.abs(pos.x) > NPC_BOUNDS || Math.abs(pos.z) > NPC_BOUNDS) {
      this.isAlive = false;
      if (typeof this.onBoundsExit === 'function') this.onBoundsExit(this);
      return;
    }

    // Fizyczny przód to lokalne +Z (Car.applyControl neguje siłę silnika).
    const q   = body.quaternion;
    const fx  = 2 * (q.x * q.z + q.w * q.y);
    const fz  = 1 - 2 * (q.x * q.x + q.y * q.y);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const heading  = Math.atan2(fx, fz);
    const vel      = body.velocity;
    const fwdSpeed = (vel.x * fx + vel.z * fz) / (Math.hypot(fx, fz) || 1);

    this._stateTime += dt;
    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    this._stuckCount = Math.max(0, this._stuckCount - dt * 0.2);

    if (this._handleFlip(upY, heading, dt)) {
      this.applyControl(0, 0, false, dt);
      this.sync(dt);
      this._updateSmoke(dt);
      return;
    }

    // Widzenie gracza: stożek przodu, zasięg, brak budynku na linii wzroku; poza tym pamięć.
    this._clock += dt;
    const hasPlayer = playerActive && !!playerPos;
    const pose = carPose(this, this._pose);
    this._tgtVisible = hasPlayer && perceiveTarget(pose, playerPos.x, playerPos.z,
      playerVel ? playerVel.x : 0, playerVel ? playerVel.z : 0, this._tgtMem, this._clock);

    if (NPCCar.policy) {
      this._driveLearned(hasPlayer, pose, dt);
      return;
    }

    const playerDist = hasPlayer ? Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z) : Infinity;
    const mem = this._tgtMem;
    const errToPlayer = hasPlayer
      ? _wrap(Math.atan2(mem.x - pos.x, mem.z - pos.z) - heading)
      : Math.PI;
    this._think(playerDist, errToPlayer, allNpcs);

    // ── Cel zależny od intencji ──
    let tx, tz;
    let cruiseSpeed = CRUISE_SPEED * this._skill;
    let throttleCap = 1.0;
    switch (this._state) {
      case State.HUNT:
      case State.RAM: {
        // Goni tam, gdzie ostatnio widział gracza (z przewidywaniem ruchu)
        const ram = this._state === State.RAM;
        const memDist = Math.hypot(mem.x - pos.x, mem.z - pos.z);
        const closing = Math.max(8, Math.hypot(vel.x, vel.z));
        const T = Math.min(memDist / closing, (ram ? 0.8 : 1.6) * this._skill);
        tx = mem.x + mem.vx * T;
        tz = mem.z + mem.vz * T;
        cruiseSpeed = ram ? 99 : HUNT_SPEED * this._skill;
        throttleCap = ram ? RAM_THROTTLE : 1.0;
        break;
      }
      case State.BACKOFF:
      case State.FLEE: {
        // Odjazd od gracza — rozbieg przed kolejnym taranem albo ucieczka
        const ax = pos.x - playerPos.x, az = pos.z - playerPos.z;
        const len = Math.hypot(ax, az) || 1;
        const reach = this._state === State.FLEE ? 80 : 45;
        tx = pos.x + ax / len * reach;
        tz = pos.z + az / len * reach;
        cruiseSpeed = HUNT_SPEED * this._skill;
        break;
      }
      default: {
        const route = this.waypointRoute;
        this._wpTimer += dt;
        const wp = route[this.waypointIdx];
        if (Math.hypot(wp.x - pos.x, wp.z - pos.z) < 14 || this._wpTimer > 30) {
          this.waypointIdx = (this.waypointIdx + 1) % route.length;
          this._wpTimer = 0;
        }
        tx = route[this.waypointIdx].x;
        tz = route[this.waypointIdx].z;
      }
    }
    tx = _clamp(tx, -SOFT_BOUNDS + 10, SOFT_BOUNDS - 10);
    tz = _clamp(tz, -SOFT_BOUNDS + 10, SOFT_BOUNDS - 10);

    // ── Omijanie przeszkód ──
    const distToTarget = Math.hypot(tx - pos.x, tz - pos.z);
    const desiredYaw   = Math.atan2(tx - pos.x, tz - pos.z);
    const look = Math.min(LOOK_MAX, LOOK_MIN + Math.max(0, fwdSpeed) * 1.4);
    this._gatherNearby(pos, look, allNpcs);
    const aimYaw     = this._chooseDirection(pos.x, pos.z, heading, desiredYaw, distToTarget, look);
    const clearAhead = this._rayDist(pos.x, pos.z, Math.sin(heading), Math.cos(heading), look);
    const err = _wrap(aimYaw - heading);

    // ── Wykrywanie zablokowania i zawracania ──
    if (!this._maneuver) {
      if (this._lastThrottle > 0.3 && fwdSpeed < 1.0) this._stuckTimer += dt;
      else this._stuckTimer = Math.max(0, this._stuckTimer - dt * 2);

      if (this._stuckTimer > STUCK_TIME) {
        this._startUnstuck(pos, heading, err);
        if (this._stuckCount >= 4 && playerDist > 120 && typeof this.onBoundsExit === 'function') {
          this.isAlive = false;
          this.onBoundsExit(this);
          return;
        }
      } else if (Math.abs(err) > 2.0 && fwdSpeed < 4 && this._state !== State.RAM) {
        this._maneuver = { type: 'turn', t: 0, dur: 2.5, steer: 0 };
      }
    }

    // ── Sterowanie ──
    // Konwencja wejścia: steer +1 = w prawo = malejący yaw.
    let throttle, steer, brake = false;
    if (this._maneuver) {
      const m = this._maneuver;
      m.t += dt;
      // Na wstecznym steer +1 obraca przód w lewo (rosnący yaw)
      steer    = m.type === 'turn' ? Math.sign(err) : m.steer;
      throttle = -REVERSE_THROTTLE;
      const done    = m.type === 'turn' ? Math.abs(err) < 0.9 || m.t > m.dur : m.t > m.dur;
      const blocked = m.t > 0.8 && Math.abs(fwdSpeed) < 0.4;
      if (done || blocked) {
        this._maneuver = null;
        this._stuckTimer = 0;
      }
    } else {
      const steerScale = 1 / (1 + Math.max(0, fwdSpeed - 12) * 0.05);
      steer = (-err * STEER_P + body.angularVelocity.y * STEER_D) * steerScale;

      const turn = Math.min(1, Math.abs(err) / 1.2);
      let vTarget = cruiseSpeed * (1 - 0.65 * turn);
      vTarget = Math.min(vTarget, 6 + clearAhead * 0.9);
      const dv = vTarget - fwdSpeed;
      if (dv < -4) {
        throttle = 0;
        brake = true;
      } else {
        throttle = _clamp(dv * 0.25 + 0.25, 0, throttleCap);
      }
    }

    steer = _clamp(steer, -1, 1);
    const maxStep = STEER_RATE * dt;
    this._steerSmooth += _clamp(steer - this._steerSmooth, -maxStep, maxStep);
    this._lastThrottle = throttle;
    this._lastControl = [this._steerSmooth, _clamp(throttle, -1, 1), brake ? 1 : 0, throttle > 1 ? 1 : 0];

    this.applyControl(throttle, this._steerSmooth, brake, dt);
    if (this._tlMat) this._tlMat.emissiveIntensity = (brake || throttle < 0) ? 6.0 : 1.8;
    this.sync(dt);

    this._updateSmoke(dt);
  }

  // Pełne sterowanie siecią; celem jest gracz widziany/zapamiętany (albo trasa, gdy gracza brak).
  _driveLearned(hasPlayer, pose, dt) {
    let mem = this._tgtMem, visible = this._tgtVisible;
    if (!hasPlayer || !Number.isFinite(this._clock - mem.seenAt)) {
      const route = this.waypointRoute;
      const wp = route[this.waypointIdx];
      if (Math.hypot(wp.x - pose.x, wp.z - pose.z) < 14) this.waypointIdx = (this.waypointIdx + 1) % route.length;
      mem = this._wpMem;
      mem.x = route[this.waypointIdx].x; mem.z = route[this.waypointIdx].z;
      mem.vx = 0; mem.vz = 0; mem.seenAt = this._clock;
      visible = true;
    }

    const f = this._feat;
    egoFeatures(pose, this.hp / this.maxHp, f, 0);
    targetFeatures(pose, mem, visible, this._clock, f);
    attitudeFeatures(pose, f);
    const [steer, throttle, brake, boost] = NPCCar.policy.predict(f);
    const thr = boost > 0.5 && throttle > 0 ? throttle * 1.3 : throttle;
    const braking = brake > 0.5;

    if (Math.hypot(pose.vx, pose.vz) < 0.5) this._stuckTimer += dt;
    else this._stuckTimer = 0;
    const playerDist = hasPlayer ? Math.hypot(this._tgtMem.x - pose.x, this._tgtMem.z - pose.z) : Infinity;
    if (this._stuckTimer > LEARNED_STUCK_RESPAWN && playerDist > 60 && typeof this.onBoundsExit === 'function') {
      this.isAlive = false;
      this.onBoundsExit(this);
      return;
    }

    this.applyControl(thr, _clamp(steer, -1, 1), braking, dt);
    if (this._tlMat) this._tlMat.emissiveIntensity = (braking || thr < 0) ? 6.0 : 1.8;
    this.sync(dt);
    this._updateSmoke(dt);
  }

  _setState(s) {
    this._state = s;
    this._stateTime = 0;
    if (s === State.BACKOFF) {
      this._backoffDur = 2.2 + Math.random() * 1.3;
      this._maneuver = { type: 'reverse', t: 0, dur: 0.7 + Math.random() * 0.4, steer: Math.random() < 0.5 ? -0.7 : 0.7 };
    } else if (s === State.CRUISE) {
      this.waypointIdx = this._nearestWaypoint();
      this._wpTimer = 0;
    }
  }

  _think(playerDist, errToPlayer, allNpcs) {
    if (playerDist === Infinity) {
      if (this._state !== State.CRUISE) this._setState(State.CRUISE);
      return;
    }
    const lowHp = this.hp < this.maxHp * FLEE_HP_RATIO && this._aggression < 0.85;
    const sees  = this._tgtVisible;
    const memAge = this._clock - this._tgtMem.seenAt;

    switch (this._state) {
      case State.CRUISE:
        if (lowHp) {
          if (playerDist < 50) this._setState(State.FLEE);
        } else if (this._attackCooldown <= 0
                && sees && playerDist < this._detectRange
                && this._countAttackers(allNpcs) < MAX_ATTACKERS) {
          this._setState(State.HUNT);
        }
        break;
      case State.HUNT:
        if (lowHp) this._setState(State.FLEE);
        else if (memAge > MEMORY_S) {
          // zgubił gracza z oczu na dłużej
          this._setState(State.CRUISE);
          this._attackCooldown = 3;
        } else if (sees && playerDist < RAM_DIST && Math.abs(errToPlayer) < RAM_ALIGN) {
          this._setState(State.RAM);
        }
        break;
      case State.RAM:
        if (playerDist < HIT_DIST) this._setState(State.BACKOFF);
        else if (!sees || this._stateTime > 3 || Math.abs(errToPlayer) > 1.3) this._setState(State.HUNT);
        break;
      case State.BACKOFF:
        if (this._stateTime > this._backoffDur) this._setState(lowHp ? State.FLEE : State.HUNT);
        break;
      case State.FLEE:
        if (playerDist > 130) {
          this._setState(State.CRUISE);
          this._attackCooldown = 6;
        }
        break;
    }
  }

  _countAttackers(allNpcs) {
    let n = 0;
    if (!allNpcs) return n;
    for (const o of allNpcs) {
      if (o === this || !o.isAlive) continue;
      if (o._state === State.HUNT || o._state === State.RAM || o._state === State.BACKOFF) n++;
    }
    return n;
  }

  _nearestWaypoint() {
    const pos = this.chassisBody?.position;
    if (!pos) return this.waypointIdx;
    let best = 0, bestD = Infinity;
    this.waypointRoute.forEach((wp, i) => {
      const d = (wp.x - pos.x) ** 2 + (wp.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  _startUnstuck(pos, heading, err) {
    let steer;
    if (Math.abs(err) > 0.3) {
      steer = Math.sign(err);
    } else {
      // Cel na wprost za ścianą — cofaj tak, by przód obrócił się w wolniejszą stronę
      const left  = this._rayDist(pos.x, pos.z, Math.sin(heading + 0.9), Math.cos(heading + 0.9), LOOK_MAX);
      const right = this._rayDist(pos.x, pos.z, Math.sin(heading - 0.9), Math.cos(heading - 0.9), LOOK_MAX);
      steer = left >= right ? 1 : -1;
    }
    this._maneuver = { type: 'reverse', t: 0, dur: 1.1 + Math.random() * 0.5, steer };
    this._stuckTimer = 0;
    this._stuckCount++;
  }

  _handleFlip(upY, heading, dt) {
    if (upY > 0.45) {
      this._flipTimer = 0;
      return false;
    }
    this._flipTimer += dt;
    if (this._flipTimer > FLIP_RESET_TIME) {
      const b = this.chassisBody;
      b.position.y += 1.5;
      b.quaternion.setFromEuler(0, heading, 0);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      this._flipTimer = 0;
      this._maneuver = null;
      this._stuckTimer = 0;
    }
    return true;
  }

  _gatherNearby(pos, look, allNpcs) {
    const near = gatherStatic(pos.x, pos.z, look + 1, this._near);
    const r = look + 1;
    if (!allNpcs) return;
    let k = 0;
    for (const o of allNpcs) {
      if (o === this || !o.chassisBody || !(o.isAlive || o._isDying)) continue;
      const p = o.chassisBody.position;
      if (Math.abs(p.x - pos.x) > r || Math.abs(p.z - pos.z) > r) continue;
      const box = this._carBoxes[k] || (this._carBoxes[k] = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
      k++;
      box.minX = p.x - CAR_AVOID_HALF; box.maxX = p.x + CAR_AVOID_HALF;
      box.minZ = p.z - CAR_AVOID_HALF; box.maxZ = p.z + CAR_AVOID_HALF;
      near.push(box);
    }
  }

  _rayDist(ox, oz, dx, dz, maxD) {
    return rayDist(ox, oz, dx, dz, maxD, this._near);
  }

  // Wybiera kierunek najbliższy celowi, który nie prowadzi w przeszkodę.
  _chooseDirection(ox, oz, heading, desiredYaw, distToTarget, look) {
    const cap = Math.min(look, distToTarget + 2);
    if (this._rayDist(ox, oz, Math.sin(desiredYaw), Math.cos(desiredYaw), cap) >= cap - 0.01) {
      this._avoidSide = 0;
      return desiredYaw;
    }
    let best = desiredYaw, bestScore = -Infinity;
    for (const off of PROBE_OFFSETS) {
      const yaw = desiredYaw + off;
      const reach = this._rayDist(ox, oz, Math.sin(yaw), Math.cos(yaw), cap) / cap;
      let score = reach * 2.0 + Math.cos(off) * 0.8 - Math.abs(_wrap(yaw - heading)) * 0.12;
      if (this._avoidSide !== 0 && Math.sign(off) === this._avoidSide) score += 0.25;
      if (score > bestScore) { bestScore = score; best = yaw; }
    }
    this._avoidSide = Math.sign(_wrap(best - desiredYaw));
    return best;
  }

  // forceFire=true — pomija odliczanie wybuchu (używane podczas _isDying)
  _updateSmoke(dt, forceFire = false) {
    if (!this.onSmoke) return;
    const smokeLevel = forceFire ? 0.90 : this.damageSystem.getSmokeLevel();
    if (smokeLevel > 0.45) {
      this._smokeTimer += dt;
      let smokeType, interval;
      if (smokeLevel >= 0.78) {
        smokeType = Math.random() > 0.45 ? 'fire' : 'black';
        interval  = 0.04;
        if (!forceFire && this._fireTimer === 0) this._fireTimer = 0.001;
      } else if (smokeLevel >= 0.62) {
        smokeType = 'black';
        interval  = 0.12;
      } else {
        smokeType = 'white';
        interval  = 0.22;
      }
      if (this._smokeTimer >= interval) {
        this._smokeTimer = 0;
        const p = this.group.position;
        this._smokeOffset.set(0, 0.5, 1.55).applyQuaternion(this.group.quaternion);
        this.onSmoke(
          p.x + this._smokeOffset.x,
          p.y + this._smokeOffset.y,
          p.z + this._smokeOffset.z,
          smokeType
        );
      }
    }
    // Odliczanie do samoczynnego wybuchu (np. po długim pożarze bez gracza)
    if (!forceFire && this._fireTimer > 0 && this._fireTimer < 2) {
      this._fireTimer += dt;
      if (this._fireTimer >= 1.0 && typeof this.onFireExplode === 'function') {
        this._fireTimer = 2;
        this.onFireExplode();
      }
    }
  }

  // Wywołane przez main.js gdy isAlive=false ale _isDying=true
  updateDying(dt) {
    if (!this.chassisBody) return;

    // Zeruj siły napędowe i kierowanie — tylko bezwład fizyki
    if (this.vehicle) {
      for (let i = 0; i < 4; i++) {
        this.vehicle.applyEngineForce(0, i);
        this.vehicle.setSteeringValue(0, i);
        this.vehicle.setBrake(0, i);
      }
    }

    this.sync(dt);

    // 2× gęstszy ogień podczas umierania
    if (this.onSmoke) {
      this._smokeTimer += dt;
      if (this._smokeTimer >= 0.02) {
        this._smokeTimer = 0;
        const p = this.group.position;
        this._smokeOffset.set(0, 0.5, 1.55).applyQuaternion(this.group.quaternion);
        this.onSmoke(
          p.x + this._smokeOffset.x,
          p.y + this._smokeOffset.y,
          p.z + this._smokeOffset.z,
          Math.random() > 0.3 ? 'fire' : 'black'
        );
      }
    }

    // Odliczanie do wybuchu (2-3s)
    this._dyingTimer += dt;
    if (this._dyingExplodeAt > 0
        && this._dyingTimer >= this._dyingExplodeAt
        && typeof this.onDyingExplode === 'function') {
      const vel = this.chassisBody.velocity;
      const cb  = this.onDyingExplode;
      this.onDyingExplode = null; // zapobiega podwójnemu wywołaniu
      cb(this, vel.x, vel.y, vel.z);
    }
  }
}
