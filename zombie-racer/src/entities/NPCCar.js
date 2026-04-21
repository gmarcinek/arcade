import * as THREE from 'three';
import { Car } from '../car/Car.js';

const NPC_MAX_HP    = 600;
const NPC_BOUNDS    = 410;
const RADAR_RANGE   = 120;   // m — NPC aktywnie goni gracza tylko gdy jest w tej odległości
const STEER_SMOOTH  = 0.05;  // lerp kierowania — mniejszy = bardziej płynny
const STEER_GAIN_WP = 1.4;   // gain podczas jazdy po waypointach (wolniejsza odpowiedź)
const STEER_GAIN_CH = 0.9;   // gain podczas gonienia (szybsza odpowiedź na bliski cel)
const STEER_DAMP    = 0.55;  // tłumienie pochodnej (angular velocity)
const NOISE_RANGE   = 2.5;   // m — losowy offset celu (naturalność pursue)
const NOISE_INTERVAL= 1.0;   // s — co ile sekund losujemy nowy offset

export class NPCCar extends Car {
  constructor(waypointRoute, color = 0xcc2200) {
    super({ stats: { engine: 0.8, defence: 0.7, offence: 0.7 } });
    this.waypointRoute  = waypointRoute;
    this.waypointIdx    = 0;
    this.npcColor       = color;
    this.hp             = NPC_MAX_HP;
    this.maxHp          = NPC_MAX_HP;
    this.onDestroyed    = null;
    this._steerSmooth   = 0;
    this._chasing       = false;  // czy aktywnie goni gracza
    this._noiseX        = 0;
    this._noiseZ        = 0;
    this._noiseTimer    = Math.random() * NOISE_INTERVAL; // desync między NPC
    this._smokeTimer    = Math.random() * 0.5;
    this.onSmoke        = null; // callback(x, y, z, type)
    this._smokeOffset   = new THREE.Vector3();
    this.onFireExplode   = null; // callback() — 1s po wejściu w fazę ogień
    this._fireTimer      = 0;   // 0=nie startował; >0=odliczanie; 2=wybuchło
    this._isDying        = false;
    this._dyingTimer     = 0;   // akumulowany czas od śmierci
    this._dyingExplodeAt = 0;   // losowe 2-3s, ustawiane przy _isDying=true
    this.onDyingExplode  = null; // callback(npc, velX, velY, velZ)
  }

  buildNPC(scene, world, terrain) {
    const spawn = this.waypointRoute[0];
    const hy = terrain.getHeightAt(spawn.x, spawn.z) + 2.5;
    this.build(scene, world, spawn.x, hy, spawn.z, this.npcColor);
  }

  update(terrain, playerPos, playerVel, allNpcs) {
    if (!this.isAlive || !this.vehicle) return;

    const pos = this.chassisBody.position;

    if (Math.abs(pos.x) > NPC_BOUNDS || Math.abs(pos.z) > NPC_BOUNDS) {
      this.isAlive = false;
      if (typeof this.onDestroy === 'function') this.onDestroy();
      return;
    }

    // ── Timer szumu (losowy offset co NOISE_INTERVAL sekund) ────
    const dt = 1 / 60;
    this._noiseTimer += dt;
    if (this._noiseTimer >= NOISE_INTERVAL) {
      this._noiseTimer = 0;
      this._noiseX = (Math.random() * 2 - 1) * NOISE_RANGE;
      this._noiseZ = (Math.random() * 2 - 1) * NOISE_RANGE;
    }

    // ── Radar: czy gracz jest w zasięgu 30m? ─────────────────────
    let targetX, targetZ;
    let gain = STEER_GAIN_WP;
    this._chasing = false;

    if (playerPos) {
      const dpx = playerPos.x - pos.x;
      const dpz = playerPos.z - pos.z;
      const playerDist = Math.sqrt(dpx * dpx + dpz * dpz);
      if (playerDist <= RADAR_RANGE) {
        // PURSUE: przewiduj przyszłą pozycję gracza
        // T = czas dolotu = dystans / prędkość NPC (przybliżona)
        const npcSpeed = Math.max(1, this.chassisBody.velocity.length());
        const T = Math.min(playerDist / npcSpeed, 2.0); // cap 2s
        const vx = playerVel ? playerVel.x : 0;
        const vz = playerVel ? playerVel.z : 0;
        targetX = playerPos.x + vx * T + this._noiseX;
        targetZ = playerPos.z + vz * T + this._noiseZ;
        gain = STEER_GAIN_CH;
        this._chasing = true;
      }
    }

    // Poza radarem — jedź po waypointach
    if (!this._chasing) {
      const wp = this.waypointRoute[this.waypointIdx];
      const dx = wp.x - pos.x, dz = wp.z - pos.z;
      if (Math.sqrt(dx * dx + dz * dz) < 12)
        this.waypointIdx = (this.waypointIdx + 1) % this.waypointRoute.length;
      targetX = this.waypointRoute[this.waypointIdx].x;
      targetZ = this.waypointRoute[this.waypointIdx].z;
    }

    // ── Regulator PD ──────────────────────────────────────────────
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const targetAngle = Math.atan2(dx, dz);

    // Kąt "przód" — gdy auto jedzie, używamy kierunku prędkości (eliminuje błąd ±π kwaternionu).
    // Gdy stoi, fallback na kwaternion (z korektą o π bo fizyczna przód = lokalne -Z).
    const vel = this.chassisBody.velocity;
    const groundSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    let carYaw;
    if (groundSpeed > 0.8) {
      carYaw = Math.atan2(vel.x, vel.z);
    } else {
      const q = this.chassisBody.quaternion;
      carYaw = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y * q.y + q.z * q.z)
      ) + Math.PI;
    }

    let err = targetAngle - carYaw;
    while (err >  Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;

    const angVelY  = this.chassisBody.angularVelocity.y;
    const pTerm    = err / (Math.PI * gain);
    const dTerm    = -angVelY * STEER_DAMP;
    const rawSteer = Math.max(-1, Math.min(1, pTerm + dTerm));
    this._steerSmooth += (rawSteer - this._steerSmooth) * STEER_SMOOTH;

    // Gaz: pełny gdy ściga gracza, redukowany na zakrętach podczas normalnej jazdy
    const turnPenalty = this._chasing ? 0 : Math.abs(this._steerSmooth) * 0.35;
    const throttle = Math.max(0.55, 1.0 - turnPenalty);

    this.applyControl(throttle, this._steerSmooth, false);
    this.sync(dt);

    this._updateSmoke(dt);
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
