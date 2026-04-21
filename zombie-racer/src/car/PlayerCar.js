import { Car } from './Car.js';
import * as CANNON from 'cannon-es';
import { MAX_STEER, BOOST_DURATION, BOOST_MULTIPLIER, BOOST_RECHARGE_RATE, BOOST_RAMP_RATE, AIR_DRAG } from '../physicsConfig.js';

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
  }

  update(input, dt = 1 / 60) {
    // Ramp steer: 600ms to full lock (rate ~1.667/s), 200ms return (rate 5.0/s)
    const target = input.steer;
    const diff   = target - this._steerSmooth;
    const returning = (target === 0 || Math.abs(target) < Math.abs(this._steerSmooth));
    const rate   = returning ? 5.0 : (1.0 / 0.6);
    const step   = Math.min(Math.abs(diff), rate * dt);
    this._steerSmooth += Math.sign(diff) * step;

    // Boost — state machine
    // _boostLocked: po wyczerpaniu paliwa trzeba poczekać na pełne naładowanie
    if (this._boostFuel >= 1.0) this._boostLocked = false; // odblokuj gdy pełny

    const canStart  = !this._boostLocked && this._boostFuel >= 1.0;
    const wantBoost = input.boost && (this.boostActive || canStart);

    // Zatrzymaj boost: brak Shift LUB paliwo skończone
    if (this.boostActive && (!input.boost || this._boostFuel <= 0)) {
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
    this.applyControl(throttle, this._steerSmooth, input.brake);

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
    }

    this.sync(dt);
  }
}
