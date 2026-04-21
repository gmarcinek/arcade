import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  // Dwuetapowy wybuch:
  // Etap 1 (natychmiastowy) — ognisty kula + szczątki
  // Etap 2 (po 180ms) — fala uderzeniowa dymu + chmura
  spawnExplosion(x, y, z) {
    // ── Etap 1A: ognisty rdzeń ──────────────────────────────────────
    this._spawnBurst(x, y + 0.5, z, {
      count: 40, color: 0xff4400, size: 1.2,
      speed: 14, yMin: 3, yExtra: 10,
      life: 1.1, gravity: 5.0,
    });
    // ── Etap 1B: jasne jądro ────────────────────────────────────────
    this._spawnBurst(x, y + 0.5, z, {
      count: 20, color: 0xffcc00, size: 0.9,
      speed: 8, yMin: 2, yExtra: 7,
      life: 0.7, gravity: 4.0,
    });
    // ── Etap 1C: odłamki / gruz ─────────────────────────────────────
    this._spawnBurst(x, y + 0.5, z, {
      count: 18, color: 0x333333, size: 0.45,
      speed: 18, yMin: 4, yExtra: 8,
      life: 2.0, gravity: 9.8,
    });

    // ── Etap 2 (opóźniony): chmura dymu + fala ─────────────────────
    setTimeout(() => {
      // Czarny dym szybko rosnący w górę
      this._spawnBurst(x, y + 1.0, z, {
        count: 35, color: 0x111111, size: 1.6,
        speed: 5, yMin: 4, yExtra: 5,
        life: 3.5, gravity: -1.2, initialOpacity: 0.55,
      });
      // Biały obłok za chmurą
      this._spawnBurst(x, y + 0.5, z, {
        count: 22, color: 0xbbbbbb, size: 1.3,
        speed: 7, yMin: 2, yExtra: 4,
        life: 2.8, gravity: -0.8, initialOpacity: 0.40,
      });
      // Poziomy ring debris
      this._spawnRing(x, y + 0.3, z, {
        count: 28, color: 0xff6600, size: 0.5,
        radius: 2.5, speed: 13, yBias: 1.5,
        life: 1.2, gravity: 6.0,
      });
    }, 180);
  }

  // Pomocnik: burst z jednego punktu
  _spawnBurst(x, y, z, { count, color, size, speed, yMin, yExtra, life, gravity, initialOpacity }) {
    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities.push({
        x: (Math.random() - 0.5) * speed,
        y: Math.random() * yExtra + yMin,
        z: (Math.random() - 0.5) * speed,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true,
      transparent: true,
      opacity: initialOpacity ?? 1.0,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({ points, positions, velocities, life, maxLife: life, initialOpacity: initialOpacity ?? 1.0, gravity: gravity ?? 9.8 });
  }

  // Pomocnik: poziomy ring cząsteczek
  _spawnRing(x, y, z, { count, color, size, radius, speed, yBias, life, gravity }) {
    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      positions[i * 3]     = x + Math.cos(angle) * radius * Math.random();
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z + Math.sin(angle) * radius * Math.random();
      velocities.push({
        x: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
        y: yBias + Math.random() * 2,
        z: Math.sin(angle) * speed * (0.7 + Math.random() * 0.6),
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 1.0, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({ points, positions, velocities, life, maxLife: life, initialOpacity: 1.0, gravity: gravity ?? 9.8 });
  }

  spawnBloodSplatter(x, y, z) {
    const count = 10;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities.push({
        x: (Math.random() - 0.5) * 6,
        y: Math.random() * 4,
        z: (Math.random() - 0.5) * 6,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({ color: 0x880000, size: 0.5, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.particles.push({ points, positions, velocities, life: 1.0 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      const g = p.gravity !== undefined ? p.gravity : 9.8;
      const posArr = p.points.geometry.attributes.position.array;
      for (let j = 0; j < p.velocities.length; j++) {
        p.velocities[j].y -= g * dt;
        posArr[j * 3]     += p.velocities[j].x * dt;
        posArr[j * 3 + 1] += p.velocities[j].y * dt;
        posArr[j * 3 + 2] += p.velocities[j].z * dt;
      }
      p.points.geometry.attributes.position.needsUpdate = true;

      // Smoke particles use controlled initialOpacity * fade; others use raw life
      if (p.initialOpacity !== undefined) {
        p.points.material.opacity = Math.max(0, p.initialOpacity * (p.life / p.maxLife));
      } else {
        p.points.material.opacity = Math.max(0, p.life);
      }
      p.points.material.transparent = true;

      if (p.life <= 0) {
        this.scene.remove(p.points);
        this.particles.splice(i, 1);
      }
    }
  }

  // type: 'white' | 'black' | 'fire' | 'oilspot'
  spawnSmoke(x, y, z, type = 'white') {
    const isOil  = type === 'oilspot';
    const isFire = type === 'fire';
    const count  = isOil ? 10 : 22;

    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const velocities = [];

    const spread = isOil ? 0.75 : isFire ? 0.28 : 0.50;

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      if (isOil) {
        velocities.push({ x: 0, y: 0, z: 0 });
      } else if (isFire) {
        velocities.push({
          x: (Math.random() - 0.5) * 1.8,
          y: Math.random() * 3.5 + 2.0,
          z: (Math.random() - 0.5) * 1.8,
        });
      } else {
        velocities.push({
          x: (Math.random() - 0.5) * 0.9,
          y: Math.random() * 1.8 + 1.0,
          z: (Math.random() - 0.5) * 0.9,
        });
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let color, size, initialOpacity, life, gravity;
    if (type === 'white') {
      color = 0xdddddd;
      size  = 0.09 + Math.random() * 0.05;
      initialOpacity = 0.38;
      life    = 1.8;
      gravity = -1.5; // rises
    } else if (type === 'black') {
      color = 0x1a1a1a;
      size  = 0.10 + Math.random() * 0.05;
      initialOpacity = 0.52;
      life    = 2.0;
      gravity = -1.8; // rises faster
    } else if (type === 'fire') {
      color = Math.random() > 0.45 ? 0xff4400 : 0xff9900;
      size  = 0.06 + Math.random() * 0.04;
      initialOpacity = 0.85;
      life    = 0.55;
      gravity = 0.4;
    } else { // oilspot
      color = 0x0a0a0a;
      size  = 0.22 + Math.random() * 0.10;
      initialOpacity = 0.58;
      life    = 5.0;
      gravity = 0; // stays at ground
    }

    const mat = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: initialOpacity,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({ points, positions, velocities, life, maxLife: life, initialOpacity, gravity });
  }
}
