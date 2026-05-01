import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_MASS, MAX_ENGINE_FORCE, MAX_STEER, BRAKE_FORCE,
         CHASSIS_COM_OFFSET_X, CHASSIS_COM_OFFSET_Y, CHASSIS_COM_OFFSET_Z,
         ANGULAR_DAMPING, LINEAR_DAMPING,
         WHEEL_RADIUS, WHEEL_POS_X, WHEEL_POS_Z_FRONT, WHEEL_POS_Z_REAR,
         SUSPENSION_STIFFNESS, SUSPENSION_REST_LENGTH, SUSPENSION_MAX_TRAVEL,
         SUSPENSION_MAX_FORCE, DAMPING_RELAXATION, DAMPING_COMPRESSION, ROLL_INFLUENCE,
         FRICTION_SLIP_FRONT_STATIC, FRICTION_SLIP_REAR_STATIC,
         DAMAGE_PER_IMPULSE, WHEEL_SLIDE_SPEED } from '../physicsConfig.js';
import { carBodyMaterial, wheelMaterial } from '../physics/PhysicsWorld.js';
import { DamageSystem, PARTS } from './DamageSystem.js';
import { CarStats } from './CarStats.js';

// Module-level reusable objects — avoids per-frame GC pressure
const _camberQ    = new THREE.Quaternion();
const _camberAxis = new THREE.Vector3();
const _WHEEL_PARTS = [PARTS.WHEEL_FL, PARTS.WHEEL_FR, PARTS.WHEEL_RL, PARTS.WHEEL_RR];
const _wobbleForce = new CANNON.Vec3();
const _wobblePoint = new CANNON.Vec3(0, 0, 0);
const _detachedStep = new THREE.Euler();

export class Car {
  static suvGltf = null; // ustawiane z main.js po załadowaniu modelu

  constructor({ stats } = {}) {
    this.stats = stats instanceof CarStats ? stats : new CarStats(stats || {});
    this.damageSystem = new DamageSystem();
    this.hp = 100;
    this.maxHp = 100;
    this.isAlive = true;

    // Three.js
    this.group = new THREE.Group();
    this.wheelMeshes = [];
    this.chassisMesh = null;

    // Cannon
    this.chassisBody = null;
    this.vehicle = null;
    this._wobbleTime = 0;
    this._throttleFiltered = 0.0;
    this._wheelDetached = [false, false, false, false];
    this._detachedWheelState = [null, null, null, null];
  }

  build(scene, world, spawnX, spawnY, spawnZ, color = 0xff2200) {
    // ── Materiały (PBR) ──────────────────────────────────
    const paintMat = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.55,
      roughness: 0.26,
      clearcoat: 1.0,
      clearcoatRoughness: 0.07,
      side: THREE.DoubleSide,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x6688aa,
      metalness: 0.0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hlMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e0,
      emissive: new THREE.Color(0xffeeaa),
      emissiveIntensity: 2.0,
      roughness: 0.05,
      metalness: 0.1,
    });
    this._tlMat = new THREE.MeshStandardMaterial({
      color: 0xff0800,
      emissive: new THREE.Color(0xff0000),
      emissiveIntensity: 1.8,
      roughness: 0.10,
      transparent: true,
      opacity: 0.90,
    });
    const tlMat = this._tlMat;

    // ── Karoseria — model GLTF (Quaternius SUV, CC0) ─────
    this.chassisMesh = new THREE.Group();
    if (Car.suvGltf) {
      // Pobieramy tylko mesh nadwozia, bez kół (koła są proceduralne)
      const src = Car.suvGltf.scene.getObjectByName('SUV_Cube');
      if (src) {
        const body = src.clone(true);
        body.traverse(child => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const wasArray = Array.isArray(child.material);
          const mats = wasArray ? child.material : [child.material];
          const newMats = mats.map(m => {
            if (m.name === 'White')      return paintMat;
            if (m.name === 'Windows')    return glassMat;
            if (m.name === 'Headlights') return hlMat;
            if (m.name === 'TailLights') return tlMat;
            return m;
          });
          child.material = wasArray ? newMats : newMats[0];
        });
        // Model ma y=0 = poziom ziemi. chassisBody.position.y ≈ ground + 0.745
        // (wheel_radius + suspension_rest_length). Przesuwamy body tak, żeby
        // y=0 modelu był na poziomie gruntu, czyli -0.745 w układzie grupy.
        body.position.y = -0.745;
        this.chassisMesh.add(body);
      }
    } else {
      // Fallback: prosty box
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.2, 4.3), paintMat);
      m.castShadow = true;
      m.position.y = 0.3;
      this.chassisMesh.add(m);
    }

    this.group.add(this.chassisMesh);
    scene.add(this.group);

    // ═══════════════════════════════════════════════════════
    //  KOŁA — opona + obręcz wieloramienna + piasta
    // ═══════════════════════════════════════════════════════
    const tireMat   = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95, metalness: 0.0 });
    const rimMat    = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.14, metalness: 0.98 });
    const hubCapMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.20, metalness: 0.95 });

    const R = WHEEL_RADIUS;
    // Opona — lekko szersza niż obręcz
    const tireGeo = new THREE.CylinderGeometry(R, R, 0.26, 24);
    tireGeo.rotateZ(Math.PI / 2);
    // Obręcz — 5-ramienna (pentagon prism)
    const rimGeo  = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.28, 5);
    rimGeo.rotateZ(Math.PI / 2);
    // Piasta
    const hubGeo  = new THREE.CylinderGeometry(R * 0.17, R * 0.17, 0.30, 6);
    hubGeo.rotateZ(Math.PI / 2);

    for (let i = 0; i < 4; i++) {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim  = new THREE.Mesh(rimGeo,  rimMat);
      const hub  = new THREE.Mesh(hubGeo,  hubCapMat);
      tire.castShadow = rim.castShadow = true;
      wg.add(tire, rim, hub);
      scene.add(wg);
      this.wheelMeshes.push(wg);
    }

    // ── Cannon-es physics ─────────────────────────────────
    // Złożona bryła kolizji: podwozie + kabina + dach
    // Dzięki temu auto ma realistyczny moment bezwładności i może kozłować
    this.chassisBody = new CANNON.Body({ mass: CAR_MASS, material: carBodyMaterial });

    // Podwozie — szeroki, płaski kształt (dolna część auta)
    const shapeFloor  = new CANNON.Box(new CANNON.Vec3(1.15, 0.22, 2.35));
    // Kabina — węższy, wyższy kształt (górna część nadwozia)
    const shapeCabin  = new CANNON.Box(new CANNON.Vec3(0.85, 0.40, 1.15));
    // Dach — bardzo wąski, płaski (przesuwa środek masy w górę, umożliwia kozłowanie)
    const shapeRoof   = new CANNON.Box(new CANNON.Vec3(0.75, 0.12, 1.0));

    const com = new CANNON.Vec3(CHASSIS_COM_OFFSET_X, CHASSIS_COM_OFFSET_Y, CHASSIS_COM_OFFSET_Z);

    // podwozie: na osi COM (y=0 względem środka masy)
    this.chassisBody.addShape(shapeFloor, new CANNON.Vec3(com.x,          com.y - 0.18,  com.z));
    // kabina: 0.42m wyżej nad podwoziem
    this.chassisBody.addShape(shapeCabin, new CANNON.Vec3(com.x,          com.y + 0.42,  com.z + 0.12));
    // dach: kolejne 0.52m wyżej — podnosi środek masy i tensor bezwładności w osi X
    this.chassisBody.addShape(shapeRoof,  new CANNON.Vec3(com.x,          com.y + 0.90,  com.z + 0.08));

    this.chassisBody.position.set(spawnX, spawnY, spawnZ);
    this.chassisBody.angularDamping = ANGULAR_DAMPING;
    this.chassisBody.linearDamping  = LINEAR_DAMPING;
    this.chassisBody.userData = { car: this };
    // CCD — gdy prędkość > 0.1 m/s, silnik sprawdza pośrednie pozycje między krokami fizyki
    // Eliminuje tunelowanie (przelatywanie przez przeciwników przy dużej prędkości)
    this.chassisBody.ccdSpeedThreshold = 0.1;
    this.chassisBody.ccdIterations     = 10;


    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const wheelOpts = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      suspensionStiffness:   SUSPENSION_STIFFNESS,
      suspensionRestLength:  SUSPENSION_REST_LENGTH,
      frictionSlip:          FRICTION_SLIP_FRONT_STATIC,
      dampingRelaxation:     DAMPING_RELAXATION,
      dampingCompression:    DAMPING_COMPRESSION,
      maxSuspensionForce:    SUSPENSION_MAX_FORCE,
      rollInfluence:         ROLL_INFLUENCE,
      maxSuspensionTravel:   SUSPENSION_MAX_TRAVEL,
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: WHEEL_SLIDE_SPEED,
    };

    const wheelPositions = [
      new CANNON.Vec3(-WHEEL_POS_X, 0,  WHEEL_POS_Z_FRONT),  // FL
      new CANNON.Vec3( WHEEL_POS_X, 0,  WHEEL_POS_Z_FRONT),  // FR
      new CANNON.Vec3(-WHEEL_POS_X, 0, -WHEEL_POS_Z_REAR),   // RL
      new CANNON.Vec3( WHEEL_POS_X, 0, -WHEEL_POS_Z_REAR),   // RR
    ];
    wheelPositions.forEach((pos, index) => {
      wheelOpts.chassisConnectionPointLocal.copy(pos);
      this.vehicle.addWheel({
        ...wheelOpts,
        frictionSlip: index < 2 ? FRICTION_SLIP_FRONT_STATIC : FRICTION_SLIP_REAR_STATIC,
      });
    });

    this.vehicle.addToWorld(world);
  }

  // Getter: true gdy wszystkie 4 koła są w powietrzu
  get wheelsOnGround() {
    if (!this.vehicle) return true;
    return this.vehicle.wheelInfos.some(w => w.isInContact);
  }

  restoreDetachedWheels(force = true) {
    for (let i = 0; i < this._wheelDetached.length; i++) {
      if (!this._wheelDetached[i]) continue;
      if (!force && this.damageSystem.state[_WHEEL_PARTS[i]] > 0.75) continue;
      this._wheelDetached[i] = false;
      this._detachedWheelState[i] = null;
      this.wheelMeshes[i].visible = true;
    }
  }

  _detachWheel(index) {
    if (this._wheelDetached[index]) return;
    const mesh = this.wheelMeshes[index];
    const floorY = mesh.position.y - WHEEL_RADIUS * 0.9;
    this._wheelDetached[index] = true;
    this._detachedWheelState[index] = {
      velocity: new THREE.Vector3(
        this.chassisBody.velocity.x + (Math.random() - 0.5) * 4,
        2.2 + Math.random() * 2.0,
        this.chassisBody.velocity.z + (Math.random() - 0.5) * 4,
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 10,
      ),
      floorY,
    };
  }

  applyControl(throttle, steer, brake, dt = 1 / 60) {
    const throttleTarget = throttle;
    const throttleRiseRate = 2.4;
    const throttleFallRate = 4.8;
    const throttleFlipRate = 7.5;
    const sameDirection = this._throttleFiltered === 0 || Math.sign(this._throttleFiltered) === Math.sign(throttleTarget);
    const throttleRate = !sameDirection ? throttleFlipRate : (Math.abs(throttleTarget) > Math.abs(this._throttleFiltered) ? throttleRiseRate : throttleFallRate);
    const throttleDelta = throttleTarget - this._throttleFiltered;
    const throttleStep = Math.sign(throttleDelta) * Math.min(Math.abs(throttleDelta), throttleRate * dt);
    this._throttleFiltered += throttleStep;
    const effectiveThrottle = this._throttleFiltered;

    const engineMult  = this.damageSystem.getEngineMultiplier();
    const wheelMods   = this.damageSystem.getWheelModifiers(); // [FL, FR, RL, RR]
    const toeOffset   = this.damageSystem.getToeOffset();
    const brakeVal    = brake ? BRAKE_FORCE : 0;

    for (let i = 0; i < 4; i++) {
      if (!this._wheelDetached[i]) continue;
      wheelMods[i].tractionMult = 0;
      wheelMods[i].steerMult = 0;
      wheelMods[i].brakeMult = 0;
    }

    // Front-wheel drive — siła per koło × uszkodzenie danego koła × silnik
    const baseForce = effectiveThrottle * MAX_ENGINE_FORCE * this.stats.engine * engineMult;
    this.vehicle.applyEngineForce(-baseForce * wheelMods[0].tractionMult, 0); // FL
    this.vehicle.applyEngineForce(-baseForce * wheelMods[1].tractionMult, 1); // FR
    this.vehicle.applyEngineForce(0, 2); // RL — brak napędu
    this.vehicle.applyEngineForce(0, 3); // RR — brak napędu

    // Niezależny skręt per koło przód
    const steerFL = (steer * wheelMods[0].steerMult + toeOffset) * MAX_STEER;
    const steerFR = (steer * wheelMods[1].steerMult + toeOffset) * MAX_STEER;
    this.vehicle.setSteeringValue(-steerFL, 0);
    this.vehicle.setSteeringValue(-steerFR, 1);
    this.vehicle.setSteeringValue(0, 2);
    this.vehicle.setSteeringValue(0, 3);

    // Hamowanie na 4 kola, ale z ciut lzejszym tylem dla latwiejszego driftu.
    this.vehicle.setBrake(brakeVal * wheelMods[0].brakeMult, 0);
    this.vehicle.setBrake(brakeVal * wheelMods[1].brakeMult, 1);
    this.vehicle.setBrake(brakeVal * wheelMods[2].brakeMult, 2);
    this.vehicle.setBrake(brakeVal * wheelMods[3].brakeMult, 3);
  }

  sync(dt = 0) {
    if (!this.chassisBody) return;
    this._wobbleTime += dt;
    this.group.position.copy(this.chassisBody.position);
    this.group.quaternion.copy(this.chassisBody.quaternion);

    this.vehicle.wheelInfos.forEach((info, i) => {
      this.vehicle.updateWheelTransform(i);
      const t = info.worldTransform;

      if (this._wheelDetached[i]) {
        const state = this._detachedWheelState[i];
        if (!state) return;
        state.velocity.y -= 12 * dt;
        this.wheelMeshes[i].position.addScaledVector(state.velocity, dt);
        const minY = state.floorY + WHEEL_RADIUS * 0.55;
        if (this.wheelMeshes[i].position.y < minY) {
          this.wheelMeshes[i].position.y = minY;
          state.velocity.y = Math.abs(state.velocity.y) > 0.8 ? -state.velocity.y * 0.22 : 0;
          state.velocity.x *= 0.94;
          state.velocity.z *= 0.94;
        }
        _detachedStep.set(state.spin.x * dt, state.spin.y * dt, state.spin.z * dt);
        this.wheelMeshes[i].rotation.x += _detachedStep.x;
        this.wheelMeshes[i].rotation.y += _detachedStep.y;
        this.wheelMeshes[i].rotation.z += _detachedStep.z;
        state.spin.multiplyScalar(0.985);
        return;
      }

      this.wheelMeshes[i].position.copy(t.position);
      this.wheelMeshes[i].quaternion.copy(t.quaternion);

      // Visual camber: tilt damaged wheels outward around the chassis forward axis
      const dmg = this.damageSystem.state[_WHEEL_PARTS[i]];
      if (dmg > 0.05) {
        const side = (i === 0 || i === 2) ? 1 : -1; // FL/RL tilt left, FR/RR tilt right
        const camberRad = dmg * 0.22 * side; // max ~12.6° at 100% damage
        _camberAxis.set(0, 0, 1).applyQuaternion(this.group.quaternion);
        _camberQ.setFromAxisAngle(_camberAxis, camberRad);
        this.wheelMeshes[i].quaternion.premultiply(_camberQ);
      }

      // Eccentric axle wobble — jajowate kolo, os przesunieta
      if (dmg > 0.60 && dt > 0) {
        const wobbleAmt = (dmg - 0.60) / 0.40; // 0..1 from 60%→100% damage
        const speed = this.chassisBody.velocity.length();
        const freq  = (2.5 + speed * 0.22) * Math.PI * 2; // rad/s, faster at speed
        const phase = this._wobbleTime * freq + i * (Math.PI * 0.5); // stagger wheels
        // Visual offset — koło "skacze" zamiast toczyć się gładko
        this.wheelMeshes[i].position.y += Math.sin(phase) * wobbleAmt * 0.15;
        // Physical jitter — auto odczuwa wibracje
        _wobbleForce.set(0, Math.sin(phase) * wobbleAmt * 90, 0);
        this.chassisBody.applyForce(_wobbleForce, _wobblePoint);
      }
    });
  }

  receiveImpact(impulse, contactNormalWorld) {
    const invQ = this.chassisBody.quaternion.inverse();
    const localNormal = new CANNON.Vec3();
    invQ.vmult(contactNormalWorld, localNormal);
    const threeNormal = { x: localNormal.x, y: localNormal.y, z: localNormal.z };

    const rawDamage = impulse * DAMAGE_PER_IMPULSE;
    if (rawDamage < 0.01) return;

    const wheelBefore = _WHEEL_PARTS.map(part => this.damageSystem.state[part]);
    this.damageSystem.applyDamage(rawDamage, threeNormal, this.stats);

    for (let i = 0; i < 4; i++) {
      if (this._wheelDetached[i]) continue;
      const wheelDamage = this.damageSystem.state[_WHEEL_PARTS[i]];
      if (wheelDamage < 1 || wheelBefore[i] >= 1) continue;
      if (Math.random() < 0.5) this._detachWheel(i);
    }

    const totalDmg = this.damageSystem.getTotalDamagePercent();
    this.hp = Math.max(0, this.maxHp - totalDmg * this.maxHp);

    if (this.hp <= 0 && this.isAlive) {
      this.isAlive = false;
      if (typeof this.onDestroy === 'function') this.onDestroy();
    }

    return rawDamage;
  }

  destroy(world, scene) {
    if (this.vehicle) this.vehicle.removeFromWorld(world);
    if (this.chassisBody) world.removeBody(this.chassisBody);
    scene.remove(this.group);
    this.wheelMeshes.forEach(wm => scene.remove(wm));
  }
}
