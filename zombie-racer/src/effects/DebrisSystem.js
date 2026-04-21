import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_MASS } from '../physicsConfig.js';

export class DebrisSystem {
  constructor(scene, world) {
    this.scene   = scene;
    this.world   = world;
    this._pieces = [];
  }

  /**
   * Spawns 15-20 physics cubes flying from explosion point.
   * @param {number} x,y,z          — spawn world position
   * @param {number} velX,velY,velZ — car velocity snapshot at explosion moment
   * @param {function} onSmoke      — callback(x,y,z,type) for smoke emission
   */
  spawn(x, y, z, velX = 0, velY = 0, velZ = 0, onSmoke = null) {
    const count = 15 + Math.floor(Math.random() * 6); // 15-20 sztuk

    for (let i = 0; i < count; i++) {
      const sz   = 0.22 + Math.random() * 0.48;                            // 0.22 – 0.70 m
      const mass = CAR_MASS * (1 / 40 + Math.random() * (1 / 5 - 1 / 40)); // ~31 – 250 kg

      // ── Fizyka ────────────────────────────────────────────────────
      const body = new CANNON.Body({ mass });
      body.addShape(new CANNON.Box(new CANNON.Vec3(sz / 2, sz / 2, sz / 2)));
      body.position.set(
        x + (Math.random() - 0.5) * 2.5,
        y + 0.3 + Math.random() * 1.5,
        z + (Math.random() - 0.5) * 2.5
      );
      body.linearDamping  = 0.20;
      body.angularDamping = 0.40;

      // Prędkość = pęd auta + burst w stożku wzdłuż kierunku lotu NPC
      const burst    = 10 + Math.random() * 18;
      const npcSpeed = Math.sqrt(velX * velX + velZ * velZ) || 0.001;
      // Jednostkowy wektor kierunku NPC
      const fwdX = velX / npcSpeed;
      const fwdZ = velZ / npcSpeed;
      // Wektor prostopadły (boczny)
      const sideX = -fwdZ;
      const sideZ =  fwdX;
      // Stożek: ±40° od kierunku lotu + pełne 360° poniżej 50% pędu
      const coneAngle  = (Math.random() - 0.5) * (Math.PI * 0.45); // ±40°
      const cosCone    = Math.cos(coneAngle);
      const sinCone    = Math.sin(coneAngle);
      // Kierunek burstX/Z w stożku
      const burstDirX  = fwdX * cosCone + sideX * sinCone;
      const burstDirZ  = fwdZ * cosCone + sideZ * sinCone;
      const upBias = 0.35 + Math.random() * 0.65;
      const lateral = Math.sqrt(1 - upBias * upBias);
      body.velocity.set(
        velX * 0.65 + burstDirX * lateral * burst,
        Math.max(velY * 0.2, 2) + upBias * burst * 0.85,
        velZ * 0.65 + burstDirZ * lateral * burst
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
      this.world.addBody(body);

      // ── Visual ────────────────────────────────────────────────────
      const mat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.88,
        metalness: 0.25,
        emissive: new THREE.Color(0xff3300),
        emissiveIntensity: 0.9,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.castShadow = true;
      this.scene.add(mesh);

      this._pieces.push({
        body,
        mesh,
        life:          10.0,
        smokeLife:      3.5,  // sekundy emisji dymu/ognia
        emissiveLife:   2.5,  // sekundy świecenia (rozgrzany metal)
        smokeTimer:     Math.random() * 0.3,
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
        ? Math.max(0, (p.emissiveLife / 2.5) * 0.9)
        : 0;

      // Emisja dymu/ognia z gorącego gruzu
      if (p.smokeLife > 0 && p.onSmoke) {
        p.smokeTimer -= dt;
        if (p.smokeTimer <= 0) {
          p.smokeTimer = 0.22 + Math.random() * 0.30;
          const type = p.smokeLife > 2.0
            ? (Math.random() > 0.45 ? 'fire' : 'black')
            : 'black';
          p.onSmoke(bp.x, bp.y + 0.15, bp.z, type);
        }
      }

      // Fade-out przez ostatnie 2s
      if (p.life < 2.0) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = Math.max(0, p.life / 2.0);
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
