import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { ARENA_W, ARENA_H, WALL_T, PHYSICS_SCALE } from '../constants.js';

const POWERUP_TYPES = {
  HP:    { color: 0x22cc44, label: '+HP',   duration: 0 },
  SPEED: { color: 0x00aaff, label: 'SPEED', duration: 10000 },
};

const SPAWN_INTERVAL = 30000; // ms
const MAX_POWERUPS = 3;
const SPAWN_MARGIN = 100;
const POWERUP_RADIUS = 20;
const ROTATE_SPEED = 0.03;

export class PowerUpSystem {
  constructor(worldContainer, engine, world) {
    this.worldContainer = worldContainer;
    this.world = world;
    this.powerUps = [];
    this.spawnTimer = 0;
    this._entityMap = null;
    this._audioRef = null;

    this._spawn();

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        this._checkPickup(pair.bodyA, pair.bodyB);
        this._checkPickup(pair.bodyB, pair.bodyA);
      }
    });
  }

  _spawn() {
    const typeKeys = Object.keys(POWERUP_TYPES);
    const typeKey = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    const type = POWERUP_TYPES[typeKey];

    const x = WALL_T + SPAWN_MARGIN + Math.random() * (ARENA_W - 2 * (WALL_T + SPAWN_MARGIN));
    const y = WALL_T + SPAWN_MARGIN + Math.random() * (ARENA_H - 2 * (WALL_T + SPAWN_MARGIN));

    const gfx = new PIXI.Graphics();
    gfx.star(x, y, 5, POWERUP_RADIUS, POWERUP_RADIUS / 2).fill(type.color);

    const lblTxt = new PIXI.Text({ text: type.label, style: { fill: 0xffffff, fontSize: 10, fontWeight: 'bold' } });
    lblTxt.anchor.set(0.5);
    lblTxt.x = x;
    lblTxt.y = y - 28;

    this.worldContainer.addChild(gfx);
    this.worldContainer.addChild(lblTxt);

    const body = Matter.Bodies.circle(
      x * PHYSICS_SCALE,
      y * PHYSICS_SCALE,
      POWERUP_RADIUS * PHYSICS_SCALE,
      { isSensor: true, isStatic: true, label: 'powerup' },
    );
    body._powerUpType = typeKey;
    Matter.Composite.add(this.world, body);

    this.powerUps.push({ gfx, lblTxt, body, typeKey });
  }

  _checkPickup(carBody, powerUpBody) {
    if (powerUpBody.label !== 'powerup') return;
    if (carBody.label !== 'car') return;
    const idx = this.powerUps.findIndex(p => p.body === powerUpBody);
    if (idx === -1) return;

    const pu = this.powerUps[idx];
    this._applyEffect(carBody, pu.typeKey);
    this._removePowerUp(idx);
  }

  _applyEffect(carBody, typeKey) {
    if (!this._entityMap) return;
    const car = this._entityMap.get(carBody.id);
    if (!car) return;

    if (typeKey === 'HP') {
      car.hp = Math.min(car.maxHp, car.hp + 30);
    } else if (typeKey === 'SPEED') {
      car.speedBoost = 1.5;
      setTimeout(() => { car.speedBoost = 1.0; }, POWERUP_TYPES.SPEED.duration);
    }

    if (this._audioRef) this._audioRef.pickup();
  }

  _removePowerUp(idx) {
    const pu = this.powerUps[idx];
    this.worldContainer.removeChild(pu.gfx);
    this.worldContainer.removeChild(pu.lblTxt);
    Matter.Composite.remove(this.world, pu.body);
    this.powerUps.splice(idx, 1);
  }

  update(dt, entityMap, audio) {
    this._entityMap = entityMap;
    this._audioRef = audio;

    this.spawnTimer += dt * (1000 / 60);
    if (this.spawnTimer >= SPAWN_INTERVAL && this.powerUps.length < MAX_POWERUPS) {
      this._spawn();
      this.spawnTimer = 0;
    }

    for (const pu of this.powerUps) {
      pu.gfx.rotation += ROTATE_SPEED;
    }
  }

  destroy() {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      this._removePowerUp(i);
    }
  }
}
