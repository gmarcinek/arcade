import Matter from 'matter-js';

const CRASH_BASE_DAMAGE = 20;

export class CollisionSystem {
  constructor(engine, entities, audio = null) {
    this.entities = entities; // Map<body.id, Car|AICar>
    this.audio = audio;

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const entA = this.entities.get(bodyA.id);
        const entB = this.entities.get(bodyB.id);

        // car vs car collision only
        if (entA && entB) {
          const relVelX = bodyA.velocity.x - bodyB.velocity.x;
          const relVelY = bodyA.velocity.y - bodyB.velocity.y;
          const relSpeed = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
          const damage = Math.round(CRASH_BASE_DAMAGE * Math.min(relSpeed / 2, 1));
          if (damage > 0) {
            entA.takeDamage(damage);
            entB.takeDamage(damage);
            if (this.audio) this.audio.crash(Math.min(relSpeed / 4, 1.0));
          }
        }
        // car vs wall — no damage, Matter handles position correction
      }
    });
  }
}
