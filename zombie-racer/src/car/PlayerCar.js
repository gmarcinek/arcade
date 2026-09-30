import { Car } from './Car.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAX_STEER, MAX_ENGINE_FORCE, BOOST_DURATION, BOOST_MULTIPLIER, BOOST_RECHARGE_RATE, BOOST_RAMP_RATE, AIR_DRAG } from '../physicsConfig.js';

const ROCKET_BOOST_SECONDS = 12;
const SELF_RIGHT_DELAY = 1.02;
const SELF_RIGHT_TORQUE = 18000;

export class PlayerCar extends Car {
  constructor() {
    super({ stats: { engine: 1.2, defence: 1.0, offence: 1.0 } });
    // Smooth steering state (normalised -1..1)
    this._steerSmooth = 0;
    // Boost fuel: 1.0 = pełny, 0.0 = pusty
    this._boostFuel  = 1.0;
    this.boostActive = false;
    // Płynny poziom boosta 0→1 (rampuje zamiast skokowego włączenia)
    this._boostLevel = 0.0;
    // Boost można uruchomić tylko gdy zbiornik jest pełny
    this._boostLocked = false; // true = czeka na pełne naładowanie przed kolejnym boostem
    this.rocketBoostSeconds = 0;
    this.rocketBoostActive = false;
    this._rocketFlames = [];
    this._sidewaysTime = 0;
  }

  build(scene, world, spawnX, spawnY, spawnZ, color) {
    super.build(scene, world, spawnX, spawnY, spawnZ, color);
    this._buildRocketNozzles();
  }

  addRocketBoostSeconds(seconds = ROCKET_BOOST_SECONDS) {
    this.rocketBoostSeconds += seconds;
  }

  _buildRocketNozzles() {
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x252b35, metalness: 0.9, roughness: 0.25 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a12, transparent: true, opacity: 0.9, depthWrite: false });
    for (const x of [-0.58, 0.58]) {
      const nozzle = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.32, 12), nozzleMat);
      tube.rotation.x = Math.PI / 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 12), flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = -0.6;
      flame.visible = false;
      nozzle.position.set(x, -0.18, -2.24);
      nozzle.add(tube, flame);
      this.group.add(nozzle);
      this._rocketFlames.push(flame);
    }
  }

  update(input, dt = 1 / 60) {
    // Ramp steer: 500ms to full lock, 100ms return
    const target = input.steer;
    const diff   = target - this._steerSmooth;
    const returning = (target === 0 || Math.abs(target) < Math.abs(this._steerSmooth));
    const rate   = returning ? 10.0 : 2.0;
    const step   = Math.min(Math.abs(diff), rate * dt);
    this._steerSmooth += Math.sign(diff) * step;

    this.rocketBoostActive = input.boost && this.rocketBoostSeconds > 0;
    if (this.rocketBoostActive) {
      this.rocketBoostSeconds = Math.max(0, this.rocketBoostSeconds - dt);
      if (this.rocketBoostSeconds <= 0) this.rocketBoostActive = false;
    }

    // Boost — state machine
    // _boostLocked: po wyczerpaniu paliwa trzeba poczekać na pełne naładowanie
    if (this._boostFuel >= 1.0) this._boostLocked = false; // odblokuj gdy pełny

    const canStart  = !this._boostLocked && this._boostFuel >= 1.0;
    const wantBoost = !this.rocketBoostActive && input.boost && (this.boostActive || canStart);

    // Zatrzymaj boost: brak Shift LUB paliwo skończone
    if (this.boostActive && (this.rocketBoostActive || !input.boost || this._boostFuel <= 0)) {
      this.boostActive  = false;
      this._boostLocked = (this._boostFuel <= 0); // zablokuj jeśli wyczerpany
    }
    // Uruchom boost
    if (!this.boostActive && wantBoost) {
      this.boostActive = true;
    }

    if (this.boostActive) {
      this._boostFuel  = Math.max(0, this._boostFuel - dt / BOOST_DURATION);
      this._boostLevel = Math.min(1, this._boostLevel + dt * BOOST_RAMP_RATE);
      if (this._boostFuel <= 0) {
        this.boostActive  = false;
        this._boostLocked = true;
      }
    } else {
      this._boostFuel  = Math.min(1, this._boostFuel + dt * BOOST_RECHARGE_RATE);
      this._boostLevel = Math.max(0, this._boostLevel - dt * BOOST_RAMP_RATE);
    }

    const boostMult = 1.0 + (BOOST_MULTIPLIER - 1.0) * this._boostLevel;
    const throttle  = input.throttle * boostMult;
    this.applyControl(throttle, this._steerSmooth, input.brake, dt);

    if (this.instantBrakeMode && input.brake && this.chassisBody) {
      this.chassisBody.velocity.set(0, 0, 0);
    }

    if (this.rocketBoostActive && this.chassisBody) {
      const forward = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
      const thrust = MAX_ENGINE_FORCE * 1.4 * this.stats.engine * this.damageSystem.getEngineMultiplier();
      this.chassisBody.applyForce(new CANNON.Vec3(forward.x * thrust, 0, forward.z * thrust));
    }
    for (const flame of this._rocketFlames) {
      flame.visible = this.rocketBoostActive;
      if (this.rocketBoostActive) {
        const scale = 0.82 + Math.random() * 0.36;
        flame.scale.set(1, 1, scale);
      }
    }

    // Światła hamowania — jasne gdy hamuje lub jedzie wstecz
    if (this._tlMat) {
      this._tlMat.emissiveIntensity = (input.brake || input.throttle < 0) ? 6.0 : 1.8;
    }

    // Opór powietrza: F = -AIR_DRAG * v², działa przeciw kierunkowi ruchu (tylko poziomo)
    if (this.chassisBody) {
      const vel = this.chassisBody.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (speed > 1.0) {
        const f = AIR_DRAG * speed * speed;
        this.chassisBody.applyForce(
          new CANNON.Vec3(-vel.x / speed * f, 0, -vel.z / speed * f),
          new CANNON.Vec3(0, 0, 0)
        );
      }

      const up = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      const settledOnSide = up.y < 0.35 && Math.abs(vel.y) < 2.5;
      this._sidewaysTime = settledOnSide ? this._sidewaysTime + dt : 0;
      if (this._sidewaysTime >= SELF_RIGHT_DELAY) {
        let axis = up.cross(new CANNON.Vec3(0, 1, 0));
        if (axis.lengthSquared() < 0.001) {
          const forward = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
          axis = forward.cross(new CANNON.Vec3(0, 1, 0));
        }
        axis.normalize();
        const strength = Math.min(1.8, 0.7 + (this._sidewaysTime - SELF_RIGHT_DELAY) * 0.45);
        this.chassisBody.applyTorque(axis.scale(SELF_RIGHT_TORQUE * strength));
      }
    }

    this.sync(dt);
  }
}
