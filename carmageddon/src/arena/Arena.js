import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { WALLS } from './arenaData.js';
import { ARENA_W, ARENA_H, PHYSICS_SCALE } from '../constants.js';

export class Arena {
  constructor(engine, world) {
    this.container = new PIXI.Container();
    this.bodies = [];

    // background terrain
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, ARENA_W, ARENA_H).fill(0x3a7d44);
    this.container.addChild(bg);

    for (const wall of WALLS) {
      const { x, y, w, h } = wall;

      // PixiJS visual
      const g = new PIXI.Graphics();
      g.rect(x, y, w, h).fill(0x555577);
      this.container.addChild(g);

      // Matter.js static body — center-based positioning
      const cx = x + w / 2;
      const cy = y + h / 2;
      const body = Matter.Bodies.rectangle(
        cx * PHYSICS_SCALE,
        cy * PHYSICS_SCALE,
        w * PHYSICS_SCALE,
        h * PHYSICS_SCALE,
        { isStatic: true, label: 'wall', friction: 0, restitution: 0.3 },
      );
      this.bodies.push(body);
    }

    Matter.Composite.add(world, this.bodies);
  }
}
