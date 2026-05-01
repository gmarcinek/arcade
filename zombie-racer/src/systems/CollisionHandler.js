import * as CANNON from 'cannon-es';
import { BUMPER_SPEED_THRESHOLD, BUILDING_IMPACT_SCALE, CAR_IMPACT_SCALE, CAR_IMPACT_SCALE_REMOTE, DAMAGE_PER_IMPULSE, CAR_ENERGY_THRESHOLD } from '../physicsConfig.js';

export class CollisionHandler {
  constructor(world, player, zombies, npcCars, timer, hud, audio, city, onZombieKill, onCarKill, onCarHit, options = {}) {
    this._world      = world;
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
    this._remoteBodyMap = options.remoteBodyMap || null; // Map<CANNON.Body, socketId>
    this._onTreeBreak   = options.onTreeBreak   || null; // (treeIndex, impactDir, speed, launch)
    this._onRemoteHit   = options.onRemoteHit   || null; // (remoteId, damage)

    // Cooldown żeby speedup nie aplikował się co klatkę
    this._speedupCooldown = 0;
    this._postStepImpulses = []; // korekty aplikowane PO solverze

    world.addEventListener('postStep', () => {
      this._limitNpcSpin();

      // ── Korekty zderzeń aplikowane po solverze ──────────────────
      // beginContact jest przed solverem → impulsy tam dodane są
      // zjadane przez bouncing constraint. Tu już mamy końcowe v po
      // bounce'ie i możemy je nadpisać/skorygować bez interferencji.
      for (let i = 0; i < this._postStepImpulses.length; i++) {
        const c = this._postStepImpulses[i];
        c.body.applyImpulse(c.impulse, c.point);
      }
      this._postStepImpulses.length = 0;
    });

    world.addEventListener('beginContact', (event) => {
      this._handleContact(event.bodyA, event.bodyB);
      this._handleContact(event.bodyB, event.bodyA);
    });
  }

  tick(dt) {
    if (this._speedupCooldown > 0) this._speedupCooldown -= dt;
  }

  _limitNpcSpin() {
    for (const npc of this.npcCars) {
      const body = npc?.chassisBody;
      if (!body || !npc.isAlive) continue;

      const planarSpeed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z);
      const maxYawSpin = Math.max(0.35, planarSpeed * 0.10);
      const maxRollPitch = Math.max(0.2, planarSpeed * 0.05);

      if (Math.abs(body.angularVelocity.y) > maxYawSpin) {
        body.angularVelocity.y = Math.sign(body.angularVelocity.y) * maxYawSpin;
      }
      if (Math.abs(body.angularVelocity.x) > maxRollPitch) {
        body.angularVelocity.x = Math.sign(body.angularVelocity.x) * maxRollPitch;
      }
      if (Math.abs(body.angularVelocity.z) > maxRollPitch) {
        body.angularVelocity.z = Math.sign(body.angularVelocity.z) * maxRollPitch;
      }
    }
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

  /** Zwraca ContactEquation dla pary ciał (null jeśli brak kontaktu w aktualnym kroku). */
  _findContact(bodyA, bodyB) {
    for (const c of this._world.contacts) {
      if ((c.bi === bodyA && c.bj === bodyB) ||
          (c.bi === bodyB && c.bj === bodyA)) {
        return c;
      }
    }
    return null;
  }

  /** Zwraca wektor od środka masy body do punktu kontaktu (w układzie world). */
  _contactRelPoint(contact, body) {
    if (contact.bi === body) return contact.ri;
    if (contact.bj === body) return contact.rj;
    return new CANNON.Vec3();
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
      if (car === this.player) {
        this.audio.playHitWall(Math.min(1.0, normalSpeed / 12));
      }
      this.audio.playTreeBreak();
      this.audio.playImpact(Math.min(1.0, normalSpeed / 12));
      this._playScrapeFromBodies(carBody, treeBody, contactNormal.x, contactNormal.z, 0.8);
    }

    if (car === this.player) {
      if (treeHit?.broke) {
        this.hud.showMessage('🌲 DRZEWO WYRwane Z KORZENIAMI', '#88dd66', 900);
        if (this._onTreeBreak) this._onTreeBreak(treeHit.treeIndex, impactDir, impactSpeed, launchSpeed);
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
        this.audio?.playBumper();
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
        this.audio.playHitWall(Math.min(1.0, effectiveSpeed / 14));
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
      const _muNPC = (bodyA.mass * bodyB.mass) / (bodyA.mass + bodyB.mass);
      if (0.5 * _muNPC * relSpeed * relSpeed > CAR_ENERGY_THRESHOLD) {
        // Normal: from player toward NPC = direction of impact on player's car
        const nx = bodyB.position.x - bodyA.position.x;
        const nz = bodyB.position.z - bodyA.position.z;
        const len = Math.sqrt(nx * nx + nz * nz) || 1;
        const contactNormal = { x: nx / len, y: 0, z: nz / len };

        const impactForce = relSpeed * 0.5;

        // Skalowanie obrażeń gracza wg przewagi pędu:
        // momP = pęd gracza [kg·m/s], momN = pęd NPC
        // ratio > 1 → gracz szybszy → bierze mniej; ratio < 1 → NPC mocniejszy → gracz bierze więcej
        // Wzór: selfScale = 1.5 - 0.5 * ratio  →  ratio=1: ×1.0 | ratio=2: ×0.5 | ratio=0.5: ×1.25
        const momP = bodyA.mass * bodyA.velocity.length();
        const momN = npc.chassisBody.mass * npc.chassisBody.velocity.length();
        const momRatioPN = momP / Math.max(1, momN);
        const selfScaleNPC = Math.max(0.2, Math.min(2.0, 1.5 - 0.5 * momRatioPN));

        this.player.receiveImpact(impactForce * CAR_IMPACT_SCALE * selfScaleNPC, contactNormal);
        this.audio?.playHitWall(Math.min(1.0, relSpeed / 12));
        this._playScrapeFromBodies(bodyA, bodyB, contactNormal.x, contactNormal.z, 0.9);

        // Wymiana pędu: siła proporcjonalna do pędu gracza (jego masa × relSpeed)
        // gracz x1.05 przewagi nad masą NPC → lekka ale fizyczna dominacja
        const mP = this.player.chassisBody.mass * 1.05;
        const mN = npc.chassisBody.mass;
        const kickMag = Math.min(relSpeed * (mP / mN) * mN * 0.04, 1800);
        // upraszcza się do: min(mP * relSpeed * 0.04, 1800)
        // Impuls w punkcie styku → naturalny moment obrotowy bez sztucznego kąta
        const _npcContact = this._findContact(bodyA, npc.chassisBody);
        const _npcR = _npcContact ? this._contactRelPoint(_npcContact, npc.chassisBody) : new CANNON.Vec3();
        npc.chassisBody.applyImpulse(
          new CANNON.Vec3(contactNormal.x * kickMag, 0, contactNormal.z * kickMag),
          _npcR
        );

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
        } else if (momRatioPN >= 1) {
          // Nagroda tylko gdy gracz wygrał zderzenie (większy pęd)
          this.onCarHit(actualDamage, npc.maxHp);
        }

        this.hud.showMessage(`🚗 -${actualDamage} HP`, '#ffcc44', 800);
      }
      return;
    }

    // Player hits remote multiplayer car
    if (this._remoteBodyMap) {
      const remoteId = this._remoteBodyMap.get(bodyB);
      if (!remoteId) return;

      // ── Prędkość względna [m/s] ───────────────────────────────────────
      const relVelX = bodyA.velocity.x - bodyB.velocity.x;
      const relVelZ = bodyA.velocity.z - bodyB.velocity.z;
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);

      // ── Energia zderzenia: E = ½·μ·v_rel² [J] ─────────────────────────
      // μ = masa zredukowana = (mA·mB)/(mA+mB)
      const muRem = (bodyA.mass * bodyB.mass) / (bodyA.mass + bodyB.mass);
      const collisionEnergy = 0.5 * muRem * relSpeed * relSpeed;

      // ── Nadwyżka energii ponad próg = JEDYNE źródło obrażeń ───────────
      // E ≤ THRESHOLD              → 0 dmg (gate)
      // E = THRESHOLD + ε          → mikro-dmg (płynne wejście)
      // E = 2·THRESHOLD            → ekwiwalent v_eff = sqrt(THRESHOLD/μ·2)
      // Podniesienie progu odejmuje stałą od licznika → REALNA redukcja
      // obrażeń, nie tylko przesunięcie momentu w którym zaczyna boleć.
      const energyExcess = collisionEnergy - CAR_ENERGY_THRESHOLD;
      if (energyExcess <= 0) return;

      // Normalna zderzenia: jednostkowy wektor od B ku A (kierunek odrzutu A)
      const nx = bodyA.position.x - bodyB.position.x;
      const nz = bodyA.position.z - bodyB.position.z;
      const len = Math.sqrt(nx * nx + nz * nz) || 1;
      const cn = { x: nx / len, y: 0, z: nz / len };

      // ── Pęd p = m·|v| [kg·m/s] ────────────────────────────────────────
      const momA = bodyA.mass * bodyA.velocity.length();
      const momB = bodyB.mass * bodyB.velocity.length();
      const momRatio = momA / Math.max(1, momB);

      // ── Bazowy impuls obrażeń WPROST z nadwyżki energii ───────────────
      // E_excess [J] → ekwiwalent prędkości v_eff [m/s]:
      //   v_eff = sqrt(2·E_excess / μ)
      // Damage = ½·v_eff·CAR_IMPACT_SCALE_REMOTE — te same jednostki co
      // dotychczas, ale jasno widać że rośnie ~sqrt(E_excess), a próg
      // wycina kawałek krzywej u dołu zamiast ją tylko włączać/wyłączać.
      const vEff = Math.sqrt(2 * energyExcess / Math.max(1, muRem));
      const baseImpact = 0.5 * vEff * CAR_IMPACT_SCALE_REMOTE;

      // ── Skale przewagi pędu (NIE energia — pęd) ──────────────────────
      // outScale: dmg zadawany zdalnemu;  ratio=1: ×1.0 | ratio=2: ×1.02 | max ×3
      // selfScale: dmg przyjmowany;       ratio=1: ×1.0 | ratio=2: ×0.5 | ratio=0.5: ×1.25
      const outScale  = Math.max(0.1, Math.min(3.0, 1 + (momRatio - 1) * 0.02));
      const selfScale = Math.max(0.2, Math.min(2.0, 1.5 - 0.5 * momRatio));

      // ── Korekta impulsu fizycznego (NIE damage) ──────────────────────
      // Niewielka domieszka 5% różnicy pędów do tego co policzy cannon-es,
      // żeby cięższy/szybszy gracz odbijał się mniej, a słabszy bardziej.
      // ── Korekta zachowania pędu (po-solverowa) ────────────────────────
      // Remote body jest pseudo-kinematic (vel z serwera, cannon traktuje
      // jak ścianę o nieskończonej masie). Bez tej korekty lokalny gracz
      // odbija się jak od muru: v' = +v·e zamiast fizycznego v' = -v·(1-e)/2
      // dla równych mas → przy 200 km/h gracz cofa się ~14 m/s zamiast
      // kontynuować w przód z ~21 m/s.
      //
      // Składowa prędkości względnej wzdłuż normalnej kontaktu:
      const v_n_A = bodyA.velocity.x * cn.x + bodyA.velocity.z * cn.z;
      const v_n_B = bodyB.velocity.x * cn.x + bodyB.velocity.z * cn.z;
      const approachSpeed = Math.max(0, v_n_B - v_n_A); // dodatnia gdy się zbliżają

      if (approachSpeed > 0.5) {
        // Cel: zmienić ΔvA·cn o -approachSpeed·(1+e)/2 (push w -cn = do przodu)
        // Skalujemy przewagą pędu: gracz z większym pędem odbija się jeszcze
        // mniej (zachowuje więcej pędu), słabszy odbija się trochę bardziej.
        // Bazowa korekta odpowiada równym masom; momRatio = 1 daje czyste 1.0.
        const RESTITUTION = 0.20; // musi pasować do material carCar
        const advantageBoost = Math.max(0.7, Math.min(1.4, 0.85 + 0.15 * momRatio));
        const correctionMag = bodyA.mass * approachSpeed * (1 + RESTITUTION) / 2 * advantageBoost;

        this._postStepImpulses.push({
          body: bodyA,
          impulse: new CANNON.Vec3(-cn.x * correctionMag, 0, -cn.z * correctionMag),
          point: new CANNON.Vec3(0, 0, 0)
        });
      }

      // ── OBRAŻENIA: oba kierunki ze WSPÓLNEGO baseImpact ──────────────
      // → próg energii działa identycznie na remote i na self
      const dmgRemote = baseImpact * outScale;
      const dmgSelf   = baseImpact * selfScale;

      this._onRemoteHit?.(remoteId, dmgRemote, momRatio >= 1);
      if (dmgSelf > 0.05) this.player.receiveImpact(dmgSelf, cn);

      // Audio / HUD
      this.audio?.playHitWall(Math.min(1, relSpeed / 12));
      this._playScrapeFromBodies(bodyA, bodyB, cn.x, cn.z, 0.9);
      const advText = momRatio >= 1
        ? `+${((outScale - 1) * 100).toFixed(0)}%`
        : `−${((1 - outScale) * 100).toFixed(0)}%`;
      this.hud.showMessage(`🚗 UDERZENIE ${advText}`, momRatio >= 1 ? '#44ff88' : '#ff6644', 700);
      return;
    }
  }
}
