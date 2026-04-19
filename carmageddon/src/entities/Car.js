import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import {
  CAR_W, CAR_H, ARENA_W, ARENA_H,
  WALL_T, PHYSICS_SCALE,
} from '../constants.js';

export class Car {
  constructor({ x, y, color, engine, world }) {
    this.angle = 0;
    this.speed = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.isAlive = true;
    this.speedBoost = 1.0;

    // PixiJS container + graphic
    this.pixiContainer = new PIXI.Container();
    this.pixiContainer.x = x;
    this.pixiContainer.y = y;

    const g = new PIXI.Graphics();
    // body
    g.rect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H).fill(color);
    // windshield to indicate front
    g.rect(-CAR_W / 2 + 4, -CAR_H / 2 + 4, CAR_W - 8, 16).fill(0xaaddff);
    this.pixiContainer.addChild(g);
    this.graphic = g;

    // Matter.js body
    this.matterBody = Matter.Bodies.rectangle(
      x * PHYSICS_SCALE,
      y * PHYSICS_SCALE,
      CAR_W * PHYSICS_SCALE,
      CAR_H * PHYSICS_SCALE,
      { frictionAir: 0, restitution: 0.2, label: 'car' },
    );
    Matter.Composite.add(world, this.matterBody);
  }

  update(_dt) {
    this._applyMovement();
  }

  _applyMovement() {
    const vx = Math.sin(this.angle) * this.speed;
    const vy = -Math.cos(this.angle) * this.speed;

    // Read current position from Matter body (may be collision-corrected from previous tick)
    const curX = this.matterBody.position.x / PHYSICS_SCALE;
    const curY = this.matterBody.position.y / PHYSICS_SCALE;

    let newX = curX + vx;
    let newY = curY + vy;

    newX = Math.max(WALL_T + CAR_W / 2, Math.min(ARENA_W - WALL_T - CAR_W / 2, newX));
    newY = Math.max(WALL_T + CAR_H / 2, Math.min(ARENA_H - WALL_T - CAR_H / 2, newY));

    Matter.Body.setPosition(this.matterBody, {
      x: newX * PHYSICS_SCALE,
      y: newY * PHYSICS_SCALE,
    });
    Matter.Body.setAngle(this.matterBody, this.angle);
    // PixiJS position is updated by syncFromPhysics() after Matter.Engine.update()
  }

  syncFromPhysics() {
    this.pixiContainer.x = this.matterBody.position.x / PHYSICS_SCALE;
    this.pixiContainer.y = this.matterBody.position.y / PHYSICS_SCALE;
    this.pixiContainer.rotation = this.matterBody.angle;
    this.angle = this.matterBody.angle;
  }

  takeDamage(n) {
    if (!this.isAlive) return;
    this.hp = Math.max(0, this.hp - n);
    if (this.hp === 0) this.die();
  }

  die() {
    this.isAlive = false;
    if (typeof this.onDie === 'function') this.onDie();
  }
}
