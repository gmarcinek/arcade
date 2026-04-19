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
import { DamageSystem } from './DamageSystem.js';
import { CarStats } from './CarStats.js';

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
    wheelPositions.forEach(pos => {
      wheelOpts.chassisConnectionPointLocal.copy(pos);
      this.vehicle.addWheel({ ...wheelOpts });
    });

    this.vehicle.addToWorld(world);
  }

  applyControl(throttle, steer, brake) {
    const { speedMultiplier, steerMultiplier } = this.damageSystem.getHandlingModifier();
    const force    = throttle * MAX_ENGINE_FORCE * this.stats.engine * speedMultiplier;
    const steerVal = steer * MAX_STEER * steerMultiplier;
    const brakeVal = brake ? BRAKE_FORCE : 0;

    // Front-wheel drive — tylko koła 0 i 1 (przód)
    this.vehicle.applyEngineForce(-force, 0);
    this.vehicle.applyEngineForce(-force, 1);
    this.vehicle.applyEngineForce(0, 2);
    this.vehicle.applyEngineForce(0, 3);

    // Front wheels steer only — negacja bo oś X odwrócona
    this.vehicle.setSteeringValue(-steerVal, 0);
    this.vehicle.setSteeringValue(-steerVal, 1);
    this.vehicle.setSteeringValue(0, 2);
    this.vehicle.setSteeringValue(0, 3);

    for (let i = 0; i < 4; i++) this.vehicle.setBrake(brakeVal, i);
  }

  sync() {
    if (!this.chassisBody) return;
    this.group.position.copy(this.chassisBody.position);
    this.group.quaternion.copy(this.chassisBody.quaternion);

    this.vehicle.wheelInfos.forEach((info, i) => {
      this.vehicle.updateWheelTransform(i);
      const t = info.worldTransform;
      this.wheelMeshes[i].position.copy(t.position);
      this.wheelMeshes[i].quaternion.copy(t.quaternion);
    });
  }

  receiveImpact(impulse, contactNormalWorld) {
    const invQ = this.chassisBody.quaternion.inverse();
    const localNormal = new CANNON.Vec3();
    invQ.vmult(contactNormalWorld, localNormal);
    const threeNormal = { x: localNormal.x, y: localNormal.y, z: localNormal.z };

    const rawDamage = impulse * DAMAGE_PER_IMPULSE;
    if (rawDamage < 0.01) return;

    this.damageSystem.applyDamage(rawDamage, threeNormal, this.stats);
    const totalDmg = this.damageSystem.getTotalDamagePercent();
    this.hp = Math.max(0, 100 - totalDmg * 100);

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
