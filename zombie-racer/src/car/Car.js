import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_MASS, MAX_ENGINE_FORCE, MAX_STEER, BRAKE_FORCE,
         CHASSIS_COM_OFFSET_X, CHASSIS_COM_OFFSET_Y, CHASSIS_COM_OFFSET_Z,
         ANGULAR_DAMPING, LINEAR_DAMPING,
         WHEEL_RADIUS, WHEEL_POS_X, WHEEL_POS_Z_FRONT, WHEEL_POS_Z_REAR,
         SUSPENSION_STIFFNESS, SUSPENSION_REST_LENGTH, SUSPENSION_MAX_TRAVEL,
         SUSPENSION_MAX_FORCE, DAMPING_RELAXATION, DAMPING_COMPRESSION, ROLL_INFLUENCE,
         FRICTION_SLIP_FRONT_STATIC, FRICTION_SLIP_REAR_STATIC,
         FRICTION_SLIP_FRONT_DYNAMIC, FRICTION_SLIP_REAR_DYNAMIC,
         SLIP_SPEED_MIN, SLIP_SPEED_MAX } from '../physicsConfig.js';
import { carBodyMaterial, wheelMaterial } from '../physics/PhysicsWorld.js';
import { DamageSystem } from './DamageSystem.js';
import { CarStats } from './CarStats.js';
import { makeWheelTexture } from '../utils/ProceduralTextures.js';

const _wheelTex = makeWheelTexture();

export class Car {
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
    // ── Three.js visuals ──────────────────────────────────
    const chassisGeo = new THREE.BoxGeometry(2.4, 0.7, 4.8);
    const chassisMat = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x443322 });
    this.chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    this.chassisMesh.castShadow = true;

    // Zderzaki
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 40 });
    const bumperFGeo = new THREE.BoxGeometry(2.2, 0.35, 0.4);
    const bumperF = new THREE.Mesh(bumperFGeo, bumperMat);
    bumperF.position.set(0, -0.18, 2.6);
    this.chassisMesh.add(bumperF);
    const bumperR = new THREE.Mesh(bumperFGeo.clone(), bumperMat);
    bumperR.position.set(0, -0.18, -2.6);
    this.chassisMesh.add(bumperR);

    // Kabina
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.65, 2.4);
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0x222233, shininess: 120, specular: 0x4466aa });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.set(0, 0.68, 0.15);
    this.chassisMesh.add(cabinMesh);

    // Maska silnika
    const hoodMat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
    const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 1.5), hoodMat);
    hoodMesh.position.set(0, 0.47, 1.65);
    this.chassisMesh.add(hoodMesh);

    // Bagażnik
    const trunkMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 1.1), hoodMat);
    trunkMesh.position.set(0, 0.45, -1.8);
    this.chassisMesh.add(trunkMesh);

    // Lusterka
    const mirrorMat = new THREE.MeshPhongMaterial({ color: 0x444455, shininess: 60 });
    [-1.02, 1.02].forEach(x => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), mirrorMat);
      m.position.set(x, 0.78, 0.95);
      this.chassisMesh.add(m);
    });

    this.group.add(this.chassisMesh);
    scene.add(this.group);

    // Koła z teksturą
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshPhongMaterial({ map: _wheelTex, shininess: 30 });
    for (let i = 0; i < 4; i++) {
      const wm = new THREE.Mesh(wheelGeo, wheelMat);
      wm.castShadow = true;
      scene.add(wm);
      this.wheelMeshes.push(wm);
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
      customSlidingRotationalSpeed: -30,
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

    // Front-wheel drive only — negacja bo cannon-es indexForwardAxis=2 (+Z = tył auta)
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

    // Dynamic grip loss: rear tyres lose traction faster than front
    if (this.chassisBody && this.vehicle.wheelInfos.length === 4) {
      const speed = this.chassisBody.velocity.length();
      const t = Math.max(0, Math.min(1, (speed - SLIP_SPEED_MIN) / (SLIP_SPEED_MAX - SLIP_SPEED_MIN)));
      this.vehicle.wheelInfos[0].frictionSlip = FRICTION_SLIP_FRONT_STATIC - (FRICTION_SLIP_FRONT_STATIC - FRICTION_SLIP_FRONT_DYNAMIC) * t;
      this.vehicle.wheelInfos[1].frictionSlip = FRICTION_SLIP_FRONT_STATIC - (FRICTION_SLIP_FRONT_STATIC - FRICTION_SLIP_FRONT_DYNAMIC) * t;
      this.vehicle.wheelInfos[2].frictionSlip = FRICTION_SLIP_REAR_STATIC  - (FRICTION_SLIP_REAR_STATIC  - FRICTION_SLIP_REAR_DYNAMIC)  * t;
      this.vehicle.wheelInfos[3].frictionSlip = FRICTION_SLIP_REAR_STATIC  - (FRICTION_SLIP_REAR_STATIC  - FRICTION_SLIP_REAR_DYNAMIC)  * t;
    }
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

    const rawDamage = impulse * 0.0008;
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
