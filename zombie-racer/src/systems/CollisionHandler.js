import * as CANNON from 'cannon-es';
import { BUMPER_SPEED_THRESHOLD, BUILDING_IMPACT_SCALE, CAR_IMPACT_SCALE, DAMAGE_PER_IMPULSE } from '../physicsConfig.js';

export class CollisionHandler {
  constructor(world, player, zombies, npcCars, timer, hud, audio, city, onZombieKill, onCarKill, onCarHit) {
    this.player      = player;
    this.zombies     = zombies;
    this.npcCars     = npcCars;
    this.timer       = timer;
    this.hud         = hud;
    this.audio       = audio;
    this.city        = city;
    this.onZombieKill = onZombieKill;
    this.onCarKill   = onCarKill;
    this.onCarHit    = onCarHit || (() => {});

    // Cooldown żeby speedup nie aplikował się co klatkę
    this._speedupCooldown = 0;

    world.addEventListener('beginContact', (event) => {
      this._handleContact(event.bodyA, event.bodyB);
      this._handleContact(event.bodyB, event.bodyA);
    });
  }

  tick(dt) {
    if (this._speedupCooldown > 0) this._speedupCooldown -= dt;
  }

  _playScrapeFromBodies(bodyA, bodyB, normalX, normalZ, multiplier = 1) {
    if (!this.audio) return;
    const velB = bodyB.velocity || CANNON.Vec3.ZERO;
    const relVelX = bodyA.velocity.x - velB.x;
    const relVelZ = bodyA.velocity.z - velB.z;
    const normalDot = relVelX * normalX + relVelZ * normalZ;
    const tangentX = relVelX - normalDot * normalX;
    const tangentZ = relVelZ - normalDot * normalZ;
    const tangentialSpeed = Math.sqrt(tangentX * tangentX + tangentZ * tangentZ);
    if (tangentialSpeed > 1.2) {
      this.audio.playScrape(Math.min(1.0, tangentialSpeed / 10) * multiplier);
    }
  }

  _findCarByBody(body) {
    if (body === this.player.chassisBody) return this.player;
    return this.npcCars.find(car => car.chassisBody === body) || null;
  }

  _handleTreeContact(car, carBody, treeBody) {
    const treeVel = treeBody.velocity || CANNON.Vec3.ZERO;
    const relVelX = carBody.velocity.x - treeVel.x;
    const relVelZ = carBody.velocity.z - treeVel.z;
    const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
    if (relSpeed <= 1.2) return;

    const nx = treeBody.position.x - carBody.position.x;
    const nz = treeBody.position.z - carBody.position.z;
    const len = Math.sqrt(nx * nx + nz * nz) || 1;
    const contactNormal = { x: nx / len, y: 0, z: nz / len };

    const normalSpeed = Math.max(0, relVelX * contactNormal.x + relVelZ * contactNormal.z);
    if (normalSpeed <= 0.35) return;

    const impactDir = { x: contactNormal.x, z: contactNormal.z };
    const treeMass = treeBody.userData?.treeMass || 3000;
    const carMass = carBody.mass || 1500;
    const reducedMass = (carMass * treeMass) / (carMass + treeMass);
    const impactEnergy = 0.5 * reducedMass * normalSpeed * normalSpeed;
    const treeDamage = impactEnergy / 450;
    const carImpactImpulse = impactEnergy / 150;
    const launchSpeed = normalSpeed * (carMass / (carMass + treeMass));
    const treeHit = this.city?.applyTreeHit(treeBody, impactDir, normalSpeed, treeDamage, launchSpeed);

    car.receiveImpact(carImpactImpulse, contactNormal);

    if (this.audio) {
      this.audio.playImpact(Math.min(1.0, normalSpeed / 12));
      this._playScrapeFromBodies(carBody, treeBody, contactNormal.x, contactNormal.z, 0.8);
    }

    if (car === this.player) {
      if (treeHit?.broke) {
        this.hud.showMessage('🌲 DRZEWO WYRwane Z KORZENIAMI', '#88dd66', 900);
      } else if (treeHit) {
        this.hud.showMessage(`🌲 ${Math.ceil(treeHit.hp)}/${treeHit.maxHp} HP`, '#88dd66', 500);
      }
    }
  }

  _handleContact(bodyA, bodyB) {
    const car = this._findCarByBody(bodyA);

    if (bodyB.userData?.tree && car) {
      this._handleTreeContact(car, bodyA, bodyB);
      return;
    }

    if (bodyB.userData?.launchPad && car) {
      if (this.city?.requestLaunchPadPulse(bodyB, bodyA) && car === this.player) {
        this.hud.showMessage('🚀 LAUNCH!', '#ffff00', 800);
      }
      return;
    }

    if (bodyA !== this.player.chassisBody) return;

    // ── Speedup bank ──────────────────────────────────────────────
    if (bodyB.userData?.speedup && this._speedupCooldown <= 0) {
      const vel = bodyA.velocity;
      const spd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const boost = bodyB.userData.speedupForce || 18;
      let dirX = 0;
      let dirZ = 0;

      if (spd > 0.75) {
        dirX = vel.x / spd;
        dirZ = vel.z / spd;
      } else if (bodyB.userData.speedupDir) {
        dirX = bodyB.userData.speedupDir.x;
        dirZ = bodyB.userData.speedupDir.z;
      } else {
        const forward = bodyA.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
        const forwardLen = Math.sqrt(forward.x * forward.x + forward.z * forward.z) || 1;
        dirX = forward.x / forwardLen;
        dirZ = forward.z / forwardLen;
      }

      bodyA.applyImpulse(
        new CANNON.Vec3(dirX * boost * bodyA.mass, 0, dirZ * boost * bodyA.mass),
        bodyA.position
      );
      this._speedupCooldown = 1.5;
      this.hud.showMessage('⚡ SPEED BOOST!', '#44aaff', 900);
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
      if (this.audio) {
        this.audio.playImpact(Math.min(1.0, effectiveSpeed / 14));
        this._playScrapeFromBodies(bodyA, bodyB, contactNormal.x, contactNormal.z, 1.0);
      }
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
          const nx = bodyB.position.x - bodyA.position.x;
          const nz = bodyB.position.z - bodyA.position.z;
          const len = Math.sqrt(nx * nx + nz * nz) || 1;
          this._playScrapeFromBodies(bodyA, bodyB, nx / len, nz / len, 0.7);
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
        this._playScrapeFromBodies(bodyA, bodyB, contactNormal.x, contactNormal.z, 0.9);

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
