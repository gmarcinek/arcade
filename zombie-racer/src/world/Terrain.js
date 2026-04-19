import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WORLD_SIZE, TERRAIN_RES, TERRAIN_HEIGHT_SCALE } from '../constants.js';
import { groundMaterial } from '../physics/PhysicsWorld.js';
import { makeGrassTexture } from '../utils/ProceduralTextures.js';

function generateHeightmap(res) {
  const heights = [];
  for (let row = 0; row < res; row++) {
    heights.push([]);
    for (let col = 0; col < res; col++) {
      const nx = col / res;
      const nz = row / res;
      const h = 0.4 * Math.sin(nx * Math.PI * 2.5) * Math.cos(nz * Math.PI * 2.5)
              + 0.25 * Math.sin(nx * Math.PI * 7 + 0.8) * Math.sin(nz * Math.PI * 5)
              + 0.15 * Math.cos(nx * Math.PI * 12) * Math.cos(nz * Math.PI * 9)
              + 0.2; // base offset (brak dziur poniżej 0)
      heights[row].push(Math.max(0, Math.min(1, h)));
    }
  }
  return heights;
}

export class Terrain {
  constructor() {
    this.heights = null;
    this.mesh = null;
    this.body = null;
  }

  build(scene, world) {
    const res = TERRAIN_RES;
    const size = WORLD_SIZE;
    const hScale = TERRAIN_HEIGHT_SCALE;

    this.heights = generateHeightmap(res);

    // ── Three.js geometry ─────────────────────────────
    const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const col = i % res;
      const row = Math.floor(i / res);
      pos.setZ(i, this.heights[row][col] * hScale);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ map: makeGrassTexture() });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // ── Cannon-es floor ─────────────────────────────────────
    // CANNON.Plane jest zawsze niezawodna dla płaskiego terenu
    this.body = new CANNON.Body({ mass: 0, material: groundMaterial });
    this.body.addShape(new CANNON.Plane());
    this.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // normal skierowany w górę (Y+)
    this.body.position.set(0, 0, 0);
    world.addBody(this.body);
  }

  getHeightAt(x, z) {
    const res = TERRAIN_RES;
    const size = WORLD_SIZE;
    const hScale = TERRAIN_HEIGHT_SCALE;
    const halfSize = size / 2;
    const nx = (x + halfSize) / size * (res - 1);
    const nz = (z + halfSize) / size * (res - 1);
    const col = Math.floor(nx);
    const row = Math.floor(nz);
    const fc = nx - col;
    const fr = nz - row;
    const c0 = Math.max(0, Math.min(res - 1, col));
    const c1 = Math.max(0, Math.min(res - 1, col + 1));
    const r0 = Math.max(0, Math.min(res - 1, row));
    const r1 = Math.max(0, Math.min(res - 1, row + 1));
    const h00 = this.heights[r0][c0];
    const h10 = this.heights[r0][c1];
    const h01 = this.heights[r1][c0];
    const h11 = this.heights[r1][c1];
    return ((h00 * (1 - fc) + h10 * fc) * (1 - fr) +
            (h01 * (1 - fc) + h11 * fc) * fr) * hScale;
  }
}
