import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAP } from './mapData.js';
import { groundMaterial, asphaltMaterial, slickMaterial, buildingWallMaterial } from '../physics/PhysicsWorld.js';
import { makeAsphaltTexture, makeBuildingTextures } from '../utils/ProceduralTextures.js';

const _asphaltBase = makeAsphaltTexture();
const _buildingTextures = makeBuildingTextures();

export class CityBuilder {
  build(scene, world, terrain) {
    this._buildRoads(scene, world, terrain);
    this._buildBuildings(scene, world, terrain);
    this._buildRamps(scene, world, terrain);
    this._buildBanks(scene, world, terrain);
    this._buildLaunchPads(scene, world, terrain);
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

      // Ściany — buildingWallMaterial (0.1× tarcia groundMaterial → auto ślizga się po ścianie)
      const wallShape = new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2));
      const wallBody  = new CANNON.Body({ mass: 0, material: buildingWallMaterial });
      wallBody.addShape(wallShape);
      wallBody.position.set(b.x, hy + b.h / 2, b.z);
      wallBody.userData = { building: true };
      world.addBody(wallBody);

      // Dach — asphaltMaterial (normalne tarcie → można po nim jeździć)
      const roofShape = new CANNON.Box(new CANNON.Vec3(b.w / 2, 0.15, b.d / 2));
      const roofBody  = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      roofBody.addShape(roofShape);
      roofBody.position.set(b.x, hy + b.h + 0.15, b.z);
      world.addBody(roofBody);
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
    for (const b of MAP.banks) {
      const hy = terrain.getHeightAt(b.x, b.z);
      if (b.type === 'arc') {
        this._buildArcBank(scene, world, b, hy);
      } else {
        this._buildFrustumBank(scene, world, b, hy);
      }
    }
  }

  // ── Ścięty ostrosłup (frustum): prostokątna baza, kwadratowy wierzchołek, 4m wys. ──
  // Każdy bok ma inny kąt pochylenia (naturalna konsekwencja rect→square).
  _buildFrustumBank(scene, world, b, hy) {
    const bw   = b.bw ?? b.w ?? 8;   // base width  (X)
    const bd   = b.bd ?? b.d ?? 15;  // base depth  (Z)
    const requestedTop = b.tw ?? Math.max(2, Math.min(bw, bd) - 2);
    const inset = Math.max(0.5, Math.min((bw - requestedTop) * 0.5, (bd - requestedTop) * 0.5));
    const tw   = Math.max(1, Math.min(bw, bd) - inset * 2);
    const maxH = Math.tan(THREE.MathUtils.degToRad(35)) * inset;
    const h    = Math.min(b.h ?? 4, maxH);
    const rotY = b.rotY ?? 0;

    const color = b.speedup ? 0x3388ff : 0x557799;
    const mat = new THREE.MeshLambertMaterial({ color });
    const geo = this._makeFrustumGeometry(bw, bd, tw, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, hy, b.z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (b.speedup) this._addSpeedupArrow(scene, b.x, hy + h + 0.05, b.z, rotY);

    // ── Physics: ConvexPolyhedron z weryfikowanym nawijaniem CCW-od-zewnątrz ──
    // Wierzchołki (indeksowanie: 0-3 = dół, 4-7 = góra)
    const V = (x, y, z) => new CANNON.Vec3(x, y, z);
    const verts = [
      V(-bw/2, 0,  -bd/2), // 0 dół tył-lewy
      V( bw/2, 0,  -bd/2), // 1 dół tył-prawy
      V( bw/2, 0,   bd/2), // 2 dół przód-prawy
      V(-bw/2, 0,   bd/2), // 3 dół przód-lewy
      V(-tw/2, h,  -tw/2), // 4 góra tył-lewy
      V( tw/2, h,  -tw/2), // 5 góra tył-prawy
      V( tw/2, h,   tw/2), // 6 góra przód-prawy
      V(-tw/2, h,   tw/2), // 7 góra przód-lewy
    ];
    // Kolejność CCW gdy patrzymy z zewnątrz (normalna wskazuje na zewnątrz):
    // Weryfikacja: cross(e1,e2) · outward > 0 dla każdej ściany
    const faces = [
      [0, 1, 2, 3], // dół   — normalna -Y  ✓
      [4, 7, 6, 5], // góra  — normalna +Y  ✓
      [0, 4, 5, 1], // tył   — normalna -Z  ✓
      [2, 6, 7, 3], // przód — normalna +Z  ✓
      [0, 3, 7, 4], // lewy  — normalna -X  ✓
      [1, 5, 6, 2], // prawy — normalna +X  ✓
    ];
    const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
    const body  = new CANNON.Body({ mass: 0, material: asphaltMaterial });
    body.addShape(shape);
    body.position.set(b.x, hy, b.z);
    if (rotY) body.quaternion.setFromEuler(0, rotY, 0);
    body.userData = b.speedup ? { speedup: true, speedupForce: b.speedupForce || 18 } : {};
    world.addBody(body);
  }

  // ── Łukowy bank — profil Gaussa, płynny garb ────────────────────────────────
  _buildArcBank(scene, world, b, hy) {
    const bw  = b.bw ?? b.w ?? 14;
    const bd  = b.bd ?? b.d ?? 80;
    const h   = b.h  ?? 3;
    const rotY = b.rotY ?? 0;
    const color = b.speedup ? 0xff8800 : 0x445566;
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });

    const geo = this._makeArcGeometry(bw, bd, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, hy, b.z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (b.speedup) this._addSpeedupArrow(scene, b.x, hy + h + 0.05, b.z, rotY);

    // Fizyka: 9 pochylonych pudełek aproksymuje krzywą Gaussa
    const SEGS = 9;
    const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
    const segW = bw / SEGS;
    for (let i = 0; i < SEGS; i++) {
      const nx  = (i + 0.5) / SEGS * 2 - 1;
      const nxL = i / SEGS * 2 - 1;
      const nxR = (i + 1) / SEGS * 2 - 1;
      const yC  = h * Math.exp(-2.2 * nx  * nx);
      const yL  = h * Math.exp(-2.2 * nxL * nxL);
      const yR  = h * Math.exp(-2.2 * nxR * nxR);
      const angle     = Math.atan2(yR - yL, segW);
      const slopeLen  = Math.sqrt(segW * segW + (yR - yL) ** 2);
      const lx = nx * bw / 2;
      const cx = b.x + lx * cosR;
      const cz = b.z + lx * sinR;
      const body = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(slopeLen / 2, 0.25, bd / 2)));
      body.position.set(cx, hy + yC, cz);
      body.quaternion.setFromEuler(0, rotY, -angle, 'YZX');
      body.userData = b.speedup ? { speedup: true, speedupForce: b.speedupForce || 18 } : {};
      world.addBody(body);
    }
  }

  // ── Geometrie ────────────────────────────────────────────────────────────────

  // Frustum (ścięty ostrosłup): prostokątna baza bw×bd, top cofnięty o ten sam inset z każdej strony.
  // Dzięki temu każda ściana ma identyczne nachylenie, a wysokość jest clampowana do max 35 stopni.
  // Nawijanie: CCW gdy patrzymy z zewnątrz → poprawne normalne outward.
  _makeFrustumGeometry(bw, bd, tw, h) {
    const v = [
      [-bw/2, 0, -bd/2], // 0 dół tył-lewy
      [ bw/2, 0, -bd/2], // 1 dół tył-prawy
      [ bw/2, 0,  bd/2], // 2 dół przód-prawy
      [-bw/2, 0,  bd/2], // 3 dół przód-lewy
      [-tw/2, h, -tw/2], // 4 góra tył-lewy
      [ tw/2, h, -tw/2], // 5 góra tył-prawy
      [ tw/2, h,  tw/2], // 6 góra przód-prawy
      [-tw/2, h,  tw/2], // 7 góra przód-lewy
    ];
    // Quady → 2 trójkąty każdy; kolejność CCW z zewnątrz (identyczna jak faces dla CANNON):
    const quads = [
      [0, 1, 2, 3], // dół
      [4, 7, 6, 5], // góra
      [0, 4, 5, 1], // tył  (-Z)
      [2, 6, 7, 3], // przód (+Z)
      [0, 3, 7, 4], // lewy (-X)
      [1, 5, 6, 2], // prawy (+X)
    ];
    const pos = [];
    for (const [a, b, c, d] of quads) {
      pos.push(...v[a], ...v[b], ...v[c]); // tri 1: a-b-c
      pos.push(...v[a], ...v[c], ...v[d]); // tri 2: a-c-d
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Łukowy profil Gaussa: h * exp(-2.2 * (x/hw)²) — płynna krzywa
  _makeArcGeometry(bw, bd, h) {
    const SEGS_W = 16, SEGS_D = 4;
    const geo = new THREE.PlaneGeometry(bw, bd, SEGS_W, SEGS_D);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / (bw / 2);
      pos.setY(i, h * Math.exp(-2.2 * nx * nx));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // ── Strzałka speedup (wskaźnik kierunku + prędkości) ─────────────────────────
  _addSpeedupArrow(scene, x, y, z, rotY) {
    // Canvas texture z dużą strzałką kierunkową
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(0,120,255,0.85)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    // trójkąt strzałki
    ctx.beginPath();
    ctx.moveTo(20, 64); ctx.lineTo(180, 20); ctx.lineTo(180, 50);
    ctx.lineTo(236, 64);
    ctx.lineTo(180, 78); ctx.lineTo(180, 108); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    const arrowGeo = new THREE.PlaneGeometry(4, 2);
    const arrowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = -rotY;
    arrow.position.set(x, y, z);
    scene.add(arrow);
  }

  // ── Wyrzutnie w górę (launch pads) ─────────────────────────────────────────
  _buildLaunchPads(scene, world, terrain) {
    if (!MAP.launchPads) return;
    for (const lp of MAP.launchPads) {
      const hy = terrain.getHeightAt(lp.x, lp.z);

      // Wizualnie: jasna platforma z kantami
      const geo = new THREE.BoxGeometry(lp.w, 0.35, lp.d);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffaa00), emissiveIntensity: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lp.x, hy + 0.18, lp.z);
      mesh.castShadow = true;
      scene.add(mesh);

      // Chevron (podwójna strzałka w górę) na wierzchu
      this._addLaunchArrow(scene, lp.x, hy + 0.37, lp.z);

      // Ramka świecąca
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });
      const edgeGeo = new THREE.EdgesGeometry(geo);
      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
      edge.position.copy(mesh.position);
      scene.add(edge);

      // Fizyka
      const shape = new CANNON.Box(new CANNON.Vec3(lp.w / 2, 0.18, lp.d / 2));
      const body  = new CANNON.Body({ mass: 0, material: asphaltMaterial });
      body.addShape(shape);
      body.position.set(lp.x, hy + 0.18, lp.z);
      body.userData = { launchPad: true, launchForce: lp.launchForce || 22 };
      world.addBody(body);
    }
  }

  _addLaunchArrow(scene, x, y, z) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(255,220,0,0.0)';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    // Dwie strzałki w górę (chevron)
    for (const yOff of [20, 50]) {
      ctx.beginPath();
      ctx.moveTo(24, yOff + 38); ctx.lineTo(64, yOff); ctx.lineTo(104, yOff + 38);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    const geo = new THREE.PlaneGeometry(3, 3);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
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
