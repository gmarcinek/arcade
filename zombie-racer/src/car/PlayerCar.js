import { Car } from './Car.js';
import { MAX_STEER } from '../physicsConfig.js';

export class PlayerCar extends Car {
  constructor() {
    super({ stats: { engine: 1.2, defence: 1.0, offence: 1.0 } });
    // Smooth steering state (normalised -1..1)
    this._steerSmooth = 0;
  }

  update(input, dt = 1 / 60) {
    // Ramp steer: 600ms to full lock (rate ~1.667/s), 200ms return (rate 5.0/s)
    const target = input.steer;
    const diff   = target - this._steerSmooth;
    const returning = (target === 0 || Math.abs(target) < Math.abs(this._steerSmooth));
    const rate   = returning ? 5.0 : (1.0 / 0.6);
    const step   = Math.min(Math.abs(diff), rate * dt);
    this._steerSmooth += Math.sign(diff) * step;

    this.applyControl(input.throttle, this._steerSmooth, input.brake);
    this.sync();
  }
}
