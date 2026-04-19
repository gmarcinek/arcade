import { Car } from './Car.js';
import {
  ACCELERATION, MAX_SPEED, STEERING, FRICTION,
} from '../constants.js';

export class PlayerCar extends Car {
  constructor({ x, y, engine, world, input }) {
    super({ x, y, color: 0x00ff88, engine, world });
    this.input = input;
  }

  update(dt) {
    const fwd = this.input.isDown('ArrowUp') || this.input.isDown('KeyW');
    const bck = this.input.isDown('ArrowDown') || this.input.isDown('KeyS');
    const lft = this.input.isDown('ArrowLeft') || this.input.isDown('KeyA');
    const rgt = this.input.isDown('ArrowRight') || this.input.isDown('KeyD');

    const effectiveMaxSpeed = MAX_SPEED * (this.speedBoost || 1.0);
    if (fwd) this.speed = Math.min(this.speed + ACCELERATION, effectiveMaxSpeed);
    if (bck) this.speed = Math.max(this.speed - ACCELERATION, -effectiveMaxSpeed * 0.5);
    this.speed *= FRICTION;

    if (Math.abs(this.speed) > 0.1) {
      if (lft) this.angle -= STEERING * (this.speed / MAX_SPEED);
      if (rgt) this.angle += STEERING * (this.speed / MAX_SPEED);
    }

    this._applyMovement();
  }
}
