import * as THREE from 'three';
import { NPCCar } from './NPCCar.js';

const ALERT_DURATION = 20;
const ALERT_TRIGGER_RADIUS = 95;
const PURSUIT_RADIUS = 140;

export class PoliceCar extends NPCCar {
  constructor(waypointRoute) {
    super(waypointRoute, 0x14213d);
    this.isPolice = true;
    this.hp = 8500;
    this.maxHp = 8500;
    this._aggression = 1;
    this._skill = 1.25;
    this._detectRange = PURSUIT_RADIUS;
    this._attackCooldown = 0;
    this._alertRemaining = 0;
    this._sirenTimer = 0;
    this.sirenPulse = false;
    this._lightBar = [];
  }

  buildNPC(scene, world, terrain) {
    super.buildNPC(scene, world, terrain);
    this.chassisBody.mass *= 3;
    this.chassisBody.updateMassProperties();
    this.chassisMesh.scale.set(1.24, 1.16, 1.18);
    for (const wheel of this.wheelMeshes) wheel.scale.setScalar(1.18);

    const bar = new THREE.Group();
    for (const [x, color] of [[-0.34, 0x247cff], [0.34, 0xff2438]]) {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.28), material);
      lamp.position.set(x, 0.92, -0.05);
      bar.add(lamp);
      this._lightBar.push(lamp);
    }
    this.chassisMesh.add(bar);
  }

  raiseAlarm(position) {
    if (!this.chassisBody || !position) return false;
    const distance = this.chassisBody.position.distanceTo(position);
    if (distance > ALERT_TRIGGER_RADIUS) return false;
    const newlyAlerted = this._alertRemaining <= 0;
    this._alertRemaining = ALERT_DURATION;
    return newlyAlerted;
  }

  get isAlerted() {
    return this._alertRemaining > 0;
  }

  _countAttackers() {
    return 0;
  }

  update(terrain, playerPos, playerVel, allCars, dt = 1 / 60, playerActive = true) {
    this.sirenPulse = false;
    if (!this.isAlive || !this.chassisBody) return;

    if (this._alertRemaining <= 0) {
      this.applyControl(0, 0, true, dt);
      this.sync(dt);
      return;
    }

    this._alertRemaining = Math.max(0, this._alertRemaining - dt);
    this._sirenTimer -= dt;
    if (this._sirenTimer <= 0) {
      this._sirenTimer = 0.8;
      this.sirenPulse = true;
    }

    let targetPosition = playerPos;
    let targetVelocity = playerVel;
    let closestDistance = playerPos
      ? this.chassisBody.position.distanceTo(playerPos)
      : Infinity;

    for (const car of allCars) {
      if (!car || car === this || !car.isAlive || !car.chassisBody) continue;
      const distance = this.chassisBody.position.distanceTo(car.chassisBody.position);
      if (distance < closestDistance && distance <= PURSUIT_RADIUS) {
        closestDistance = distance;
        targetPosition = car.chassisBody.position;
        targetVelocity = car.chassisBody.velocity;
      }
    }

    if (!targetPosition || closestDistance > PURSUIT_RADIUS) {
      this.applyControl(0, 0, true, dt);
      this.sync(dt);
      return;
    }

    super.update(terrain, targetPosition, targetVelocity, allCars, dt, playerActive);
  }

  sync(dt = 0) {
    super.sync(dt);
    const flash = this.isAlerted && Math.floor(performance.now() / 130) % 2 === 0;
    for (let index = 0; index < this._lightBar.length; index++) {
      this._lightBar[index].material.emissiveIntensity = flash === (index === 0) ? 5 : 0.15;
    }
  }
}