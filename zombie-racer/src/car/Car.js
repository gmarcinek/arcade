import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_MASS, MAX_ENGINE_FORCE, MAX_STEER, BRAKE_FORCE } from '../constants.js';
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
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.2, 0.4, 2.4));
    this.chassisBody = new CANNON.Body({ mass: CAR_MASS, material: carBodyMaterial });
    this.chassisBody.addShape(chassisShape);
    this.chassisBody.position.set(spawnX, spawnY, spawnZ);
    this.chassisBody.angularDamping = 0.4;
    this.chassisBody.linearDamping = 0.1;
    this.chassisBody.userData = { car: this };


    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const wheelOpts = {
      radius: 0.55,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      suspensionStiffness: 22,        // niższe = bardziej miękkie, większe bujanie
      suspensionRestLength: 0.55,
      frictionSlip: 2.75,
      dampingRelaxation: 1.8,         // mniejsze = wolniejszy powrót zawieszenia
      dampingCompression: 2.8,
      maxSuspensionForce: 100000,
      rollInfluence: 0.12,            // większe = mocniejsze przećhylanie w zakrętach
      maxSuspensionTravel: 0.6,       // większy zakres ruchu zawieszenia
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: -30,
    };

    const wheelPositions = [
      new CANNON.Vec3(-1.15, 0,  1.85),  // FL
      new CANNON.Vec3( 1.15, 0,  1.85),  // FR
      new CANNON.Vec3(-1.15, 0, -1.85),  // RL
      new CANNON.Vec3( 1.15, 0, -1.85),  // RR
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

    // Rear-wheel drive only — negacja bo cannon-es indexForwardAxis=2 (+Z = tył auta)
    this.vehicle.applyEngineForce(-force, 2);
    this.vehicle.applyEngineForce(-force, 3);
    this.vehicle.applyEngineForce(0, 0);
    this.vehicle.applyEngineForce(0, 1);

    // Front wheels steer only — negacja bo oś X odwrócona
    this.vehicle.setSteeringValue(-steerVal, 0);
    this.vehicle.setSteeringValue(-steerVal, 1);
    this.vehicle.setSteeringValue(0, 2);
    this.vehicle.setSteeringValue(0, 3);

    for (let i = 0; i < 4; i++) this.vehicle.setBrake(brakeVal, i);

    // Dynamic grip loss: rear tyres lose traction faster than front
    if (this.chassisBody && this.vehicle.wheelInfos.length === 4) {
      const speed = this.chassisBody.velocity.length(); // m/s
      // Partial loss between 12 m/s (~43 km/h) and 28 m/s (~100 km/h)
      const t = Math.max(0, Math.min(1, (speed - 12) / 16));
      this.vehicle.wheelInfos[0].frictionSlip = 2.75 - 1.0  * t; // FL: 2.75→1.75
      this.vehicle.wheelInfos[1].frictionSlip = 2.75 - 1.0  * t; // FR: 2.75→1.75
      this.vehicle.wheelInfos[2].frictionSlip = 2.75 - 1.875 * t; // RL: 2.75→0.875
      this.vehicle.wheelInfos[3].frictionSlip = 2.75 - 1.875 * t; // RR: 2.75→0.875
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
