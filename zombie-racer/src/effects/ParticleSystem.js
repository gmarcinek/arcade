import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  spawnExplosion(x, y, z) {
    const count = 24;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities.push({
        x: (Math.random() - 0.5) * 12,
        y: Math.random() * 8 + 2,
        z: (Math.random() - 0.5) * 12,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({ color: 0xff6600, size: 0.8, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.particles.push({ points, positions, velocities, life: 1.5 });
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

      const posArr = p.points.geometry.attributes.position.array;
      for (let j = 0; j < p.velocities.length; j++) {
        p.velocities[j].y -= 9.8 * dt;
        posArr[j * 3]     += p.velocities[j].x * dt;
        posArr[j * 3 + 1] += p.velocities[j].y * dt;
        posArr[j * 3 + 2] += p.velocities[j].z * dt;
      }
      p.points.geometry.attributes.position.needsUpdate = true;
      p.points.material.opacity = Math.max(0, p.life);
      p.points.material.transparent = true;

      if (p.life <= 0) {
        this.scene.remove(p.points);
        this.particles.splice(i, 1);
      }
    }
  }
}
