import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_MASS } from '../physicsConfig.js';
import {
  DEBRIS_COUNT_MIN, DEBRIS_COUNT_SPREAD,
  DEBRIS_SIZE_MIN, DEBRIS_SIZE_SPREAD,
  DEBRIS_MASS_FRAC_MIN, DEBRIS_MASS_FRAC_MAX,
  DEBRIS_SPAWN_SPREAD_XZ, DEBRIS_SPAWN_Y_MIN, DEBRIS_SPAWN_Y_SPREAD,
  DEBRIS_LINEAR_DAMPING, DEBRIS_ANGULAR_DAMPING,
  DEBRIS_BURST_MIN, DEBRIS_BURST_SPREAD, DEBRIS_CONE_HALF_ANGLE,
  DEBRIS_INHERIT_VEL, DEBRIS_UP_BIAS_MIN, DEBRIS_UP_BIAS_SPREAD,
  DEBRIS_UP_MULTIPLIER, DEBRIS_VEL_Y_MIN, DEBRIS_ANGULAR_VEL,
  DEBRIS_COLOR, DEBRIS_ROUGHNESS, DEBRIS_METALNESS,
  DEBRIS_EMISSIVE_COLOR, DEBRIS_EMISSIVE_INTENSITY,
  DEBRIS_LIFE_BASE, DEBRIS_LIFE_PER_METER,
  DEBRIS_SMOKE_LIFE_BASE, DEBRIS_SMOKE_LIFE_PER_METER,
  DEBRIS_EMISSIVE_LIFE_BASE, DEBRIS_EMISSIVE_LIFE_PER_METER,
  DEBRIS_SMOKE_TIMER_JITTER, DEBRIS_SMOKE_INTERVAL_MIN, DEBRIS_SMOKE_INTERVAL_SPREAD,
  DEBRIS_SMOKE_FIRE_THRESHOLD, DEBRIS_SMOKE_FIRE_CHANCE, DEBRIS_FADE_TIME,
  DEBRIS_HIT_SOUND_SIZE_MIN, DEBRIS_HIT_SOUND_SPEED_MIN, DEBRIS_HIT_SOUND_COOLDOWN,
} from '../debrisConfig.js';

export class DebrisSystem {
  constructor(scene, world, audio = null) {
    this.scene   = scene;
    this.world   = world;
    this.audio   = audio;
    this._pieces = [];
  }

  /**
   * Spawns 25-30 physics cubes flying from explosion point.
   * @param {number} x,y,z          — spawn world position
   * @param {number} velX,velY,velZ — car velocity snapshot at explosion moment
   * @param {function} onSmoke      — callback(x,y,z,type) for smoke emission
   */
  spawn(x, y, z, velX = 0, velY = 0, velZ = 0, onSmoke = null) {
    const count = DEBRIS_COUNT_MIN + Math.floor(Math.random() * DEBRIS_COUNT_SPREAD);

    for (let i = 0; i < count; i++) {
      const sz   = DEBRIS_SIZE_MIN + Math.random() * DEBRIS_SIZE_SPREAD;
      const mass = CAR_MASS * (DEBRIS_MASS_FRAC_MIN + Math.random() * (DEBRIS_MASS_FRAC_MAX - DEBRIS_MASS_FRAC_MIN));

      // ── Fizyka ────────────────────────────────────────────────────
      const body = new CANNON.Body({ mass });
      body.addShape(new CANNON.Box(new CANNON.Vec3(sz / 2, sz / 2, sz / 2)));
      body.position.set(
        x + (Math.random() - 0.5) * DEBRIS_SPAWN_SPREAD_XZ,
        y + DEBRIS_SPAWN_Y_MIN + Math.random() * DEBRIS_SPAWN_Y_SPREAD,
        z + (Math.random() - 0.5) * DEBRIS_SPAWN_SPREAD_XZ
      );
      body.linearDamping  = DEBRIS_LINEAR_DAMPING;
      body.angularDamping = DEBRIS_ANGULAR_DAMPING;

      // Prędkość = pęd auta + burst w stożku wzdłuż kierunku lotu NPC
      const burst    = DEBRIS_BURST_MIN + Math.random() * DEBRIS_BURST_SPREAD;
      const npcSpeed = Math.sqrt(velX * velX + velZ * velZ) || 0.001;
      // Jednostkowy wektor kierunku NPC
      const fwdX = velX / npcSpeed;
      const fwdZ = velZ / npcSpeed;
      // Wektor prostopadły (boczny)
      const sideX = -fwdZ;
      const sideZ =  fwdX;
      const coneAngle  = (Math.random() - 0.5) * DEBRIS_CONE_HALF_ANGLE;
      const cosCone    = Math.cos(coneAngle);
      const sinCone    = Math.sin(coneAngle);
      // Kierunek burstX/Z w stożku
      const burstDirX  = fwdX * cosCone + sideX * sinCone;
      const burstDirZ  = fwdZ * cosCone + sideZ * sinCone;
      const upBias = DEBRIS_UP_BIAS_MIN + Math.random() * DEBRIS_UP_BIAS_SPREAD;
      const lateral = Math.sqrt(1 - upBias * upBias);
      body.velocity.set(
        velX * DEBRIS_INHERIT_VEL + burstDirX * lateral * burst,
        Math.max(velY * 0.2, DEBRIS_VEL_Y_MIN) + upBias * burst * DEBRIS_UP_MULTIPLIER,
        velZ * DEBRIS_INHERIT_VEL + burstDirZ * lateral * burst
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * DEBRIS_ANGULAR_VEL,
        (Math.random() - 0.5) * DEBRIS_ANGULAR_VEL,
        (Math.random() - 0.5) * DEBRIS_ANGULAR_VEL
      );
      let lastHitAt = -Infinity;
      body.addEventListener('collide', (event) => {
        if (!this.audio || sz < DEBRIS_HIT_SOUND_SIZE_MIN) return;
        const nowSec = performance.now() * 0.001;
        if (nowSec - lastHitAt < DEBRIS_HIT_SOUND_COOLDOWN) return;

        const impactSpeed = event.contact && typeof event.contact.getImpactVelocityAlongNormal === 'function'
          ? Math.abs(event.contact.getImpactVelocityAlongNormal())
          : body.velocity.length();

        if (impactSpeed < DEBRIS_HIT_SOUND_SPEED_MIN) return;
        lastHitAt = nowSec;
        this.audio.playDebrisHitGround(Math.min(1, impactSpeed / 12));
      });
      this.world.addBody(body);

      // ── Visual ────────────────────────────────────────────────────
      const mat = new THREE.MeshStandardMaterial({
        color:             DEBRIS_COLOR,
        roughness:         DEBRIS_ROUGHNESS,
        metalness:         DEBRIS_METALNESS,
        emissive:          new THREE.Color(DEBRIS_EMISSIVE_COLOR),
        emissiveIntensity: DEBRIS_EMISSIVE_INTENSITY,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.castShadow = true;
      this.scene.add(mesh);

      const pieceLife         = DEBRIS_LIFE_BASE         + sz * DEBRIS_LIFE_PER_METER;
      const pieceSmokeLife    = DEBRIS_SMOKE_LIFE_BASE    + sz * DEBRIS_SMOKE_LIFE_PER_METER;
      const pieceEmissiveLife = DEBRIS_EMISSIVE_LIFE_BASE + sz * DEBRIS_EMISSIVE_LIFE_PER_METER;
      this._pieces.push({
        body,
        mesh,
        life:              pieceLife,
        smokeLife:         pieceSmokeLife,
        emissiveLife:      pieceEmissiveLife,
        emissiveLifeTotal: pieceEmissiveLife,  // stała referencja do fade ratio
        smokeTimer:        Math.random() * DEBRIS_SMOKE_TIMER_JITTER,
        onSmoke,
      });
    }
  }

  update(dt) {
    for (let i = this._pieces.length - 1; i >= 0; i--) {
      const p = this._pieces[i];
      p.life         -= dt;
      p.smokeLife    -= dt;
      p.emissiveLife -= dt;

      // Sync mesh do fizyki
      const bp = p.body.position;
      const bq = p.body.quaternion;
      p.mesh.position.set(bp.x, bp.y, bp.z);
      p.mesh.quaternion.set(bq.x, bq.y, bq.z, bq.w);

      // Chłodzenie blasku (rozgrzany metal → czarny)
      p.mesh.material.emissiveIntensity = p.emissiveLife > 0
        ? Math.max(0, (p.emissiveLife / p.emissiveLifeTotal) * DEBRIS_EMISSIVE_INTENSITY)
        : 0;

      // Emisja dymu/ognia z gorącego gruzu
      if (p.smokeLife > 0 && p.onSmoke) {
        p.smokeTimer -= dt;
        if (p.smokeTimer <= 0) {
          p.smokeTimer = DEBRIS_SMOKE_INTERVAL_MIN + Math.random() * DEBRIS_SMOKE_INTERVAL_SPREAD;
          const type = p.smokeLife > DEBRIS_SMOKE_FIRE_THRESHOLD
            ? (Math.random() > (1 - DEBRIS_SMOKE_FIRE_CHANCE) ? 'fire' : 'black')
            : 'black';
          p.onSmoke(bp.x, bp.y + 0.15, bp.z, type);
        }
      }

      // Fade-out przez ostatnie DEBRIS_FADE_TIME s
      if (p.life < DEBRIS_FADE_TIME) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = Math.max(0, p.life / DEBRIS_FADE_TIME);
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.world.removeBody(p.body);
        this._pieces.splice(i, 1);
      }
    }
  }
}
