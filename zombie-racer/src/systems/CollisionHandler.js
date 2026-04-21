import * as CANNON from 'cannon-es';
import { BUMPER_SPEED_THRESHOLD, BUILDING_IMPACT_SCALE, CAR_IMPACT_SCALE, DAMAGE_PER_IMPULSE } from '../physicsConfig.js';

export class CollisionHandler {
  constructor(world, player, zombies, npcCars, timer, hud, onZombieKill, onCarKill, onCarHit) {
    this.player      = player;
    this.zombies     = zombies;
    this.npcCars     = npcCars;
    this.timer       = timer;
    this.hud         = hud;
    this.onZombieKill = onZombieKill;
    this.onCarKill   = onCarKill;
    this.onCarHit    = onCarHit || (() => {});

    // Cooldown żeby speedup/launchpad nie aplikował się co klatkę
    this._speedupCooldown = 0;
    this._launchCooldown  = 0;

    world.addEventListener('beginContact', (event) => {
      this._handleContact(event.bodyA, event.bodyB);
      this._handleContact(event.bodyB, event.bodyA);
    });
  }

  tick(dt) {
    if (this._speedupCooldown > 0) this._speedupCooldown -= dt;
    if (this._launchCooldown  > 0) this._launchCooldown  -= dt;
  }

  _handleContact(bodyA, bodyB) {
    if (bodyA !== this.player.chassisBody) return;

    // ── Speedup bank ──────────────────────────────────────────────
    if (bodyB.userData?.speedup && this._speedupCooldown <= 0) {
      const vel = bodyA.velocity;
      const spd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (spd > 1.0) {
        const boost = bodyB.userData.speedupForce || 18;
        const scale = (spd + boost) / (spd || 0.01);
        bodyA.velocity.set(vel.x * scale, vel.y, vel.z * scale);
        this._speedupCooldown = 1.5;
        this.hud.showMessage('⚡ SPEED BOOST!', '#44aaff', 900);
      }
      return;
    }

    // ── Launch pad ────────────────────────────────────────────────
    if (bodyB.userData?.launchPad && this._launchCooldown <= 0) {
      const force = bodyB.userData.launchForce || 22;
      const vel = bodyA.velocity;
      bodyA.velocity.set(vel.x * 0.7, force, vel.z * 0.7);
      bodyA.angularVelocity.set(0, bodyA.angularVelocity.y, 0);
      this._launchCooldown = 2.0;
      this.hud.showMessage('🚀 LAUNCH!', '#ffff00', 1000);
      return;
    }

    // Player hits building
    if (bodyB.userData?.building) {
      const playerSpeed = bodyA.velocity.length();
      const BUMPER_THRESHOLD = BUMPER_SPEED_THRESHOLD;
      if (playerSpeed <= BUMPER_THRESHOLD) return;
      const effectiveSpeed = playerSpeed - BUMPER_THRESHOLD;
      const nx = bodyB.position.x - bodyA.position.x;
      const nz = bodyB.position.z - bodyA.position.z;
      const len = Math.sqrt(nx * nx + nz * nz) || 1;
      const contactNormal = { x: nx / len, y: 0, z: nz / len };
      this.player.receiveImpact(effectiveSpeed * BUILDING_IMPACT_SCALE, contactNormal);
      const hpLost = Math.round(effectiveSpeed * BUILDING_IMPACT_SCALE * DAMAGE_PER_IMPULSE * 100);
      if (hpLost > 0) this.hud.showMessage(`🏗️ BUDYNEK -${hpLost} HP`, '#ff6600', 900);
      return;
    }

    // Player hits zombie
    if (bodyB.userData?.zombie) {
      const zombie = bodyB.userData.zombie;
      if (zombie.isAlive) {
        const relVelX = bodyA.velocity.x - bodyB.velocity.x;
        const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
        const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
        if (relSpeed > 2) {
          // Zombie: dokładnie 1 HP obrażeń dla gracza
          this.player.hp = Math.max(0, this.player.hp - 1);
          this.onZombieKill(zombie);
        }
      }
      return;
    }

    // Player hits NPC car
    const npc = this.npcCars.find(c => c.chassisBody === bodyB);
    if (npc && npc.isAlive) {
      const relVelX = bodyA.velocity.x - bodyB.velocity.x;
      const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);

      if (relSpeed > 1.5) {
        // Normal: from player toward NPC = direction of impact on player's car
        const nx = bodyB.position.x - bodyA.position.x;
        const nz = bodyB.position.z - bodyA.position.z;
        const len = Math.sqrt(nx * nx + nz * nz) || 1;
        const contactNormal = { x: nx / len, y: 0, z: nz / len };

        const impactForce = relSpeed * 0.5;
        this.player.receiveImpact(impactForce * CAR_IMPACT_SCALE, contactNormal);

        // Wymiana pędu: siła proporcjonalna do pędu gracza (jego masa × relSpeed)
        // gracz x1.05 przewagi nad masą NPC → lekka ale fizyczna dominacja
        const mP = this.player.chassisBody.mass * 1.05;
        const mN = npc.chassisBody.mass;
        const kickMag = Math.min(relSpeed * (mP / mN) * mN * 0.04, 1800);
        // upraszcza się do: min(mP * relSpeed * 0.04, 1800)
        npc.chassisBody.applyImpulse(
          new CANNON.Vec3(contactNormal.x * kickMag, 0, contactNormal.z * kickMag),
          npc.chassisBody.position
        );
        npc.chassisBody.angularVelocity.y += (Math.random() - 0.5) * relSpeed * 0.05;

        const npcHpBefore = npc.hp;
        const npcDamageHP = (relSpeed * relSpeed * this.player.stats.offence) / (npc.stats.defence * 3);
        npc.hp = Math.max(0, npc.hp - npcDamageHP);
        const actualDamage = Math.floor(npcHpBefore - npc.hp);

        // Sync damage state so smoke/fire visuals reflect HP loss
        const _dr = Math.min(1, 1 - (npc.hp / npc.maxHp));
        npc.damageSystem.state.engine      = Math.min(1, _dr * 1.3);
        npc.damageSystem.state.bumperFront = Math.min(1, _dr);
        npc.damageSystem.state.bumperRear  = Math.min(1, _dr * 0.9);

        if (npc.hp <= 0 && npc.isAlive) {
          this.onCarKill(npc);
        } else {
          this.onCarHit(actualDamage);
        }

        this.hud.showMessage(`🚗 -${actualDamage} HP`, '#ffcc44', 800);
      }
    }
  }
}
