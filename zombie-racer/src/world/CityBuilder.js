import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAP } from './mapData.js';
import { groundMaterial, asphaltMaterial, slickMaterial } from '../physics/PhysicsWorld.js';
import { makeAsphaltTexture, makeBuildingTextures } from '../utils/ProceduralTextures.js';

const _asphaltBase = makeAsphaltTexture();
const _buildingTextures = makeBuildingTextures();

export class CityBuilder {
  build(scene, world, terrain) {
    this._buildRoads(scene, world, terrain);
    this._buildBuildings(scene, world, terrain);
    this._buildRamps(scene, world, terrain);
    this._buildBanks(scene, world, terrain);
    this._buildTrees(scene, world, terrain);
    this._buildObstacles(scene, world, terrain);
  }

  _buildRoads(scene, world, terrain) {
    for (const r of MAP.roads) {
      const segsW = Math.max(1, Math.floor(r.w / 8));
      const segsD = Math.max(1, Math.floor(r.d / 8));
      const geo = new THREE.PlaneGeometry(r.w, r.d, segsW, segsD);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = r.x + pos.getX(i);
        const wz = r.z + pos.getZ(i);
        pos.setY(i, terrain.getHeightAt(wx, wz) + 0.06);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const tex = _asphaltBase.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(r.w / 6, r.d / 6);
      tex.needsUpdate = true;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Fizyczne ciało z asphaltMaterial — lepsza przyczepność niż trawa
      const phyShape = new CANNON.Box(new CANNON.Vec3(r.w / 2, 0.05, r.d / 2));
      const phyBody = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      phyBody.addShape(phyShape);
      phyBody.position.set(r.x, terrain.getHeightAt(r.x, r.z) + 0.05, r.z);
      world.addBody(phyBody);
    }
  }

  _buildBuildings(scene, world, terrain) {
    let ci = 0;
    for (const b of MAP.buildings) {
      const hy = terrain.getHeightAt(b.x, b.z);
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const tex = _buildingTextures[ci % _buildingTextures.length].clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(b.w / 4, b.h / 4);
      tex.needsUpdate = true;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      ci++;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, hy + b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2));
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.position.set(b.x, hy + b.h / 2, b.z);
      body.userData = { building: true };
      world.addBody(body);
    }
  }

  _buildRamps(scene, world, terrain) {
    // Angles: 5° / 8° / 12° — gradual approach, gentle launch
    const SEG_ANGLES = [5, 8, 12].map(d => d * Math.PI / 180);
    const THICK = 1.6;  // physics box thickness (buried below surface)
    const rampMat = new THREE.MeshLambertMaterial({ color: 0x998866, side: THREE.DoubleSide });

    for (const r of MAP.ramps) {
      const hy = terrain.getHeightAt(r.x, r.z);
      const segLen = r.length / 3;
      const sinY = Math.sin(r.rotY), cosY = Math.cos(r.rotY);

      // Total projected length and height of the full ramp
      const totalZ = SEG_ANGLES.reduce((s, a) => s + segLen * Math.cos(a), 0);
      const totalH = SEG_ANGLES.reduce((s, a) => s + segLen * Math.sin(a), 0);

      // ── Visual: single wedge prism — no visible rectangular cross-sections ──
      const wedgeGeo = this._makeWedgeGeometry(r.width, totalZ, totalH, THICK);
      const mesh = new THREE.Mesh(wedgeGeo, rampMat);
      mesh.rotation.y = r.rotY;
      mesh.position.set(r.x, hy, r.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // ── Physics: 3 CANNON.Box bodies — one per segment, mathematically exact ──
      let ex = r.x - (totalZ / 2) * sinY;
      let ey = hy;
      let ez = r.z - (totalZ / 2) * cosY;

      for (const a of SEG_ANGLES) {
        const ca = Math.cos(a), sa = Math.sin(a);
        const L = segLen;
        // Center of this box so its entry-top corner is exactly at (ex, ey, ez)
        const fwd = THICK / 2 * sa + L / 2 * ca;
        const cx = ex + fwd * sinY;
        const cy = ey - THICK / 2 * ca + L / 2 * sa;
        const cz = ez + fwd * cosY;

        const shape = new CANNON.Box(new CANNON.Vec3(r.width / 2, THICK / 2, L / 2));
        const body = new CANNON.Body({ mass: 0, material: asphaltMaterial });
        body.addShape(shape);
        body.position.set(cx, cy, cz);
        body.quaternion.setFromEuler(-a, r.rotY, 0, 'YXZ');
        world.addBody(body);

        ex += L * ca * sinY;
        ey += L * sa;
        ez += L * ca * cosY;
      }
    }
  }

  // Triangular prism (wedge) geometry:
  // approach end: z = -totalZ/2, y = 0 (ground level)
  // launch end:   z = +totalZ/2, y = height
  // buried base:  y = -sinkDepth (below ground, no visible front lip)
  _makeWedgeGeometry(width, totalZ, height, sinkDepth) {
    const geo = new THREE.BufferGeometry();
    const w = width / 2;
    const zh = -totalZ / 2;  // approach Z (low end)
    const zl =  totalZ / 2;  // launch  Z (high end)
    const bot = -sinkDepth;

    // 8 vertices
    const v = new Float32Array([
      // Bottom (buried)
      -w, bot, zh,  // 0
       w, bot, zh,  // 1
       w, bot, zl,  // 2
      -w, bot, zl,  // 3
      // Top surface (ramp face, car drives on this)
      -w, 0,      zh,  // 4  approach top-left   (y = ground level)
       w, 0,      zh,  // 5  approach top-right
       w, height, zl,  // 6  launch  top-right   (y = height)
      -w, height, zl,  // 7  launch  top-left
    ]);

    // Winding: CCW when viewed from outside (normal points outward)
    const idx = new Uint16Array([
      // Top ramp surface — normal points UP and slightly toward approach
      4, 6, 5,   4, 7, 6,
      // Bottom face — normal points DOWN
      0, 1, 2,   0, 2, 3,
      // Approach (front) face — normal toward -Z (approach side)
      0, 5, 1,   0, 4, 5,
      // Launch (back) face — normal toward +Z
      3, 2, 6,   3, 6, 7,
      // Left side — normal toward -X
      0, 3, 7,   0, 7, 4,
      // Right side — normal toward +X
      1, 6, 2,   1, 5, 6,
    ]);

    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return geo;
  }

  _buildBanks(scene, world, terrain) {
    if (!MAP.banks) return;
    const bankMat = new THREE.MeshLambertMaterial({ color: 0x556677, side: THREE.DoubleSide });
    for (const b of MAP.banks) {
      const hy = terrain.getHeightAt(b.x, b.z);
      const thick = 0.5;

      // Sink bank so the LOW approach edge is BELOW ground — car rides onto surface smoothly
      // heightOffset = center_y - hy; designed so low-side top surface ≈ hy - 0.3 (underground)
      const heightOffset = (b.w / 2) * Math.abs(Math.sin(b.az || 0))
                         + (b.d / 2) * Math.abs(Math.sin(b.ax || 0))
                         - thick;  // subtract full thickness → approach edge buried ~0.3m under

      const geo = new THREE.BoxGeometry(b.w, thick, b.d);
      const mesh = new THREE.Mesh(geo, bankMat);
      mesh.position.set(b.x, hy + heightOffset, b.z);
      mesh.rotation.order = 'XYZ';
      mesh.rotation.x = b.ax || 0;
      mesh.rotation.y = b.ay || 0;
      mesh.rotation.z = b.az || 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(b.w / 2, thick / 2, b.d / 2));
      const body = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      body.addShape(shape);
      body.position.set(b.x, hy + heightOffset, b.z);
      body.quaternion.setFromEuler(b.ax || 0, b.ay || 0, b.az || 0);
      world.addBody(body);
    }
  }

  _buildTrees(scene, world, terrain) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2c0a });
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x1a7a2a });
    const trunkGeoBase = new THREE.CylinderGeometry(0.4, 0.55, 4, 8);
    const canopyGeoBase = new THREE.SphereGeometry(3, 8, 6);

    for (const t of MAP.trees) {
      const hy = terrain.getHeightAt(t.x, t.z);

      const trunk = new THREE.Mesh(trunkGeoBase, trunkMat);
      trunk.position.set(t.x, hy + 2, t.z);
      trunk.castShadow = true;
      scene.add(trunk);

      const canopy = new THREE.Mesh(canopyGeoBase, canopyMat);
      canopy.position.set(t.x, hy + 6.5, t.z);
      canopy.castShadow = true;
      scene.add(canopy);

      const shape = new CANNON.Box(new CANNON.Vec3(0.5, 2, 0.5));
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.position.set(t.x, hy + 2, t.z);
      body.userData = { building: true };
      world.addBody(body);
    }
  }

  _buildObstacles(scene, world, terrain) {
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
    const stripeMat  = new THREE.MeshLambertMaterial({ color: 0xdd5500 });
    const geo     = new THREE.BoxGeometry(0.8, 1.2, 3.5);
    const stripeG = new THREE.BoxGeometry(0.82, 0.2, 3.52);

    for (const o of MAP.obstacles) {
      const hy = terrain.getHeightAt(o.x, o.z);
      const pivot = new THREE.Group();
      pivot.rotation.y = o.rotY || 0;
      pivot.position.set(o.x, hy + 0.6, o.z);

      const body = new THREE.Mesh(geo, barrierMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pivot.add(body);

      const stripe = new THREE.Mesh(stripeG, stripeMat);
      stripe.position.y = 0.25;
      pivot.add(stripe);

      scene.add(pivot);

      const shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.6, 1.75));
      const phyBody = new CANNON.Body({ mass: 0, material: groundMaterial });
      phyBody.addShape(shape);
      phyBody.position.set(o.x, hy + 0.6, o.z);
      phyBody.quaternion.setFromEuler(0, o.rotY || 0, 0);
      phyBody.userData = { building: true };
      world.addBody(phyBody);
    }
  }
}
