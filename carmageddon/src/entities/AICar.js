import { Car } from './Car.js';
import { ARENA_W, ARENA_H, WALL_T, CAR_W, CAR_H, MAX_SPEED, FRICTION } from '../constants.js';

const DETECT_RADIUS = 500;
const ATTACK_RADIUS = 200;
const WANDER_INTERVAL = 2000; // ms

const STATES = { WANDER: 0, CHASE: 1, ATTACK: 2, FLEE: 3 };

export class AICar extends Car {
  constructor(opts) {
    super({ ...opts, color: 0xef4444 }); // red
    this.state = STATES.WANDER;
    this.wanderTarget = this._randomPoint();
    this.wanderTimer = 0;
    this.playerRef = null; // set externally: aiCar.playerRef = player
  }

  update(dt) {
    if (!this.isAlive) return;
    this.wanderTimer += dt * (1000 / 60); // approximate ms

    const player = this.playerRef;
    if (!player || !player.isAlive) {
      this._wander(dt);
      this._applyMovement();
      return;
    }

    const dx = player.pixiContainer.x - this.pixiContainer.x;
    const dy = player.pixiContainer.y - this.pixiContainer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // State transitions
    if (this.hp < this.maxHp * 0.3) {
      this.state = STATES.FLEE;
    } else if (this.state === STATES.WANDER && dist < DETECT_RADIUS) {
      this.state = STATES.CHASE;
    } else if (this.state === STATES.CHASE && dist < ATTACK_RADIUS) {
      this.state = STATES.ATTACK;
    } else if (this.state === STATES.ATTACK && dist > ATTACK_RADIUS * 1.5) {
      this.state = STATES.CHASE;
    } else if (this.state === STATES.CHASE && dist > DETECT_RADIUS * 1.2) {
      this.state = STATES.WANDER;
    } else if (this.state === STATES.FLEE && this.hp > this.maxHp * 0.5) {
      this.state = STATES.WANDER;
    }

    // Behavior
    switch (this.state) {
      case STATES.WANDER: this._wander(dt); break;
      case STATES.CHASE:  this._seek(player.pixiContainer.x, player.pixiContainer.y, MAX_SPEED * 0.8); break;
      case STATES.ATTACK: this._seek(player.pixiContainer.x, player.pixiContainer.y, MAX_SPEED); break;
      case STATES.FLEE:   this._flee(player.pixiContainer.x, player.pixiContainer.y); break;
    }

    this._applyMovement();
  }

  _seek(tx, ty, targetSpeed) {
    const dx = tx - this.pixiContainer.x;
    const dy = ty - this.pixiContainer.y;
    const targetAngle = Math.atan2(dx, -dy);

    // Lerp angle toward target
    let da = targetAngle - this.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.angle += da * 0.05;

    this.speed += (targetSpeed - this.speed) * 0.05;
    this.speed *= FRICTION;
  }

  _flee(tx, ty) {
    // Flee: move in opposite direction of threat
    const fleeX = 2 * this.pixiContainer.x - tx;
    const fleeY = 2 * this.pixiContainer.y - ty;
    this._seek(fleeX, fleeY, MAX_SPEED * 0.9);
  }

  _wander(dt) {
    if (this.wanderTimer > WANDER_INTERVAL) {
      this.wanderTarget = this._randomPoint();
      this.wanderTimer = 0;
    }
    this._seek(this.wanderTarget.x, this.wanderTarget.y, MAX_SPEED * 0.5);
    // If close to wander target, pick a new one
    const dx = this.wanderTarget.x - this.pixiContainer.x;
    const dy = this.wanderTarget.y - this.pixiContainer.y;
    if (Math.sqrt(dx * dx + dy * dy) < 80) {
      this.wanderTarget = this._randomPoint();
    }
  }

  _randomPoint() {
    return {
      x: WALL_T + CAR_W + Math.random() * (ARENA_W - 2 * (WALL_T + CAR_W)),
      y: WALL_T + CAR_H + Math.random() * (ARENA_H - 2 * (WALL_T + CAR_H)),
    };
  }
}
