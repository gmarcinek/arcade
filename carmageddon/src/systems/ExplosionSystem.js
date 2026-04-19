import * as PIXI from 'pixi.js';

export class ExplosionSystem {
  constructor(container) {
    this.container = container; // worldContainer
    this.particles = [];
  }

  spawn(x, y) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      const p = {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        size: 4 + Math.random() * 8,
        color: Math.random() < 0.5 ? 0xff6600 : 0xffcc00,
        gfx: new PIXI.Graphics(),
      };
      this.container.addChild(p.gfx);
      this.particles.push(p);
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= p.decay;

      p.gfx.clear();
      if (p.life > 0) {
        p.gfx.circle(p.x, p.y, p.size * p.life).fill({ color: p.color, alpha: p.life });
      } else {
        this.container.removeChild(p.gfx);
        this.particles.splice(i, 1);
      }
    }
  }
}
