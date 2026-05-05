import * as THREE from 'three';

const MAX_SPARKS = 300;
const pool       = [];

// Thin rod: CylinderGeometry with Y axis along its length (default).
// We rotate each instance so its Y aligns with velocity → motion-blur streak.
const _geo = new THREE.CylinderGeometry(0.015, 0.015, 1, 5);
const _mat = new THREE.MeshBasicMaterial({
  color:       0xffffff,
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
});

let sparkMesh = null;

const MAX_DEBRIS  = 40;
const _cubeGeo    = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const _cubeMat    = new THREE.MeshBasicMaterial({
  color:     0xff1100,
  transparent: true,
  depthWrite: false,
  blending:  THREE.AdditiveBlending,
});
let cubeMesh = null;
const _cubePool  = [];
const _cubeHide  = new THREE.Matrix4().makeScale(0, 0, 0);
const _cubeDummy = new THREE.Object3D();

const _dummy    = new THREE.Object3D();
const _col      = new THREE.Color();
const _up       = new THREE.Vector3(0, 1, 0);
const _vel      = new THREE.Vector3();
const _q        = new THREE.Quaternion();
const _qSpin    = new THREE.Quaternion();
const _hidden   = new THREE.Matrix4().makeScale(0, 0, 0);

export function createSparks(scene) {
  sparkMesh = new THREE.InstancedMesh(_geo, _mat, MAX_SPARKS);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  for (let i = 0; i < MAX_SPARKS; i++) sparkMesh.setMatrixAt(i, _hidden);
  sparkMesh.instanceMatrix.needsUpdate = true;
  scene.add(sparkMesh);
}

export function createDebris(scene) {
  cubeMesh = new THREE.InstancedMesh(_cubeGeo, _cubeMat, MAX_DEBRIS);
  cubeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubeMesh.frustumCulled = false;
  for (let i = 0; i < MAX_DEBRIS; i++) cubeMesh.setMatrixAt(i, _cubeHide);
  cubeMesh.instanceMatrix.needsUpdate = true;
  scene.add(cubeMesh);
}

export function emitDebrisExplosion(pos, inertiaDir, speed) {
  _cubePool.length = 0;

  // Build an orthonormal frame around inertiaDir so we can spread within a cone.
  // Pick an arbitrary perpendicular axis.
  const fwd = inertiaDir.clone().normalize();
  const arb = Math.abs(fwd.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(fwd, arb).normalize();
  const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();

  const ballSpeed  = speed ?? 20;
  // Forward impulse: 3x–6x ball speed so every cube overtakes the ball
  const fwdImpulse = ballSpeed * (3.0 + Math.random() * 3.0);

  // Delta half-angle of the cone: wider outer cubes, tighter fast ones
  const CONE_HALF = Math.PI * 0.28; // ~50° half-angle

  for (let i = 0; i < MAX_DEBRIS; i++) {
    // Mass: 0.2 (small/fast) → 1.0 (large/slow) — uniform distribution
    const mass = 0.2 + (i / MAX_DEBRIS) * 0.8;

    // Lighter pieces get more forward impulse (inverse mass), heavier spread wider
    const forwardSpeed = fwdImpulse / mass;

    // Cone spread angle: heavier → wider delta angle
    const spreadAngle = CONE_HALF * Math.sqrt(mass);
    const phi   = Math.random() * Math.PI * 2;         // azimuth around fwd axis
    const theta = spreadAngle * (0.3 + Math.random() * 0.7); // radial offset within cone

    // Lateral offset in right/up plane
    const lr = Math.cos(phi) * Math.sin(theta);
    const lu = Math.sin(phi) * Math.sin(theta);

    const vel = new THREE.Vector3()
      .addScaledVector(fwd,   forwardSpeed * Math.cos(theta))
      .addScaledVector(right, forwardSpeed * lr)
      .addScaledVector(up,    forwardSpeed * lu);

    // Visual size proportional to mass (larger = more visible)
    const size = 0.18 + mass * 0.55;

    // Spin: lighter pieces spin faster
    const spinScale = 30 / mass;

    _cubePool.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: vel.x, vy: vel.y, vz: vel.z,
      rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
      wx: (Math.random() - 0.5) * spinScale,
      wy: (Math.random() - 0.5) * spinScale,
      wz: (Math.random() - 0.5) * spinScale,
      mass,
      size,
      age:  0,
      life: 0.5 + Math.random() * 0.9,
    });
  }
}

export function updateDebris(dt) {
  if (!cubeMesh) return;
  const n = _cubePool.length;
  for (let i = n - 1; i >= 0; i--) {
    const c = _cubePool[i];
    c.age += dt;
    if (c.age >= c.life) { _cubePool.splice(i, 1); continue; }
    // Heavier pieces (larger mass) have more aerodynamic drag — they slow down faster
    const dragRate = 0.3 + (c.mass ?? 0.5) * 1.2;
    const drag = Math.exp(-dragRate * dt);
    c.vx *= drag; c.vy *= drag; c.vz *= drag;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
  }
  for (let i = 0; i < MAX_DEBRIS; i++) {
    if (i >= _cubePool.length) { cubeMesh.setMatrixAt(i, _cubeHide); continue; }
    const c = _cubePool[i];
    const t = c.age / c.life;
    // Shrink: starts at full size, collapses toward 0
    const sc = (c.size ?? 0.35) * Math.max(0, 1.0 - t * t * 1.1);
    _cubeDummy.position.set(c.x, c.y, c.z);
    _cubeDummy.rotation.set(c.rx, c.ry, c.rz);
    _cubeDummy.scale.setScalar(sc);
    _cubeDummy.updateMatrix();
    cubeMesh.setMatrixAt(i, _cubeDummy.matrix);
    // Colour: white-hot → orange → deep red as they cool
    const cool = Math.min(1, t * 1.4);
    const r = 1.0;
    const g = Math.max(0, 0.85 - cool * 0.85);
    const b = Math.max(0, 0.6  - cool * 0.6);
    _col.setRGB(r, g, b);
    cubeMesh.setColorAt(i, _col);
  }
  cubeMesh.count = Math.min(n, MAX_DEBRIS);
  cubeMesh.instanceMatrix.needsUpdate = true;
  if (cubeMesh.instanceColor) cubeMesh.instanceColor.needsUpdate = true;
}

export function clearSparks() {
  pool.length = 0;
}

// pos      — THREE.Vector3 contact point
// normalOut — THREE.Vector3 pointing away from the tunnel wall (toward center)
// speed    — forward speed (m/s), carries sparks forward like wind
// impact   — radial impact speed (m/s), scales spark count & energy
export function emitBounce(pos, normalOut, speed, impact) {
  const count = Math.min(40, Math.floor(8 + impact * 0.8));
  for (let i = 0; i < count; i++) {
    const tangAngle = Math.random() * Math.PI * 2;
    const tangSpeed = 1.5 + Math.random() * 3.0;
    // Tangent on the cylinder surface perpendicular to normalOut
    const tx = -normalOut.y * Math.cos(tangAngle) * tangSpeed;
    const ty =  normalOut.x * Math.cos(tangAngle) * tangSpeed;
    pool.push({
      x:  pos.x, y: pos.y, z: pos.z,
      vx: normalOut.x * (1.5 + Math.random() * 3.5) + tx,
      vy: normalOut.y * (1.5 + Math.random() * 3.5) + ty,
      vz: speed * (0.35 + Math.random() * 0.8),  // wind carries sparks forward
      age:  0,
      life: 0.5 + Math.random() * 1.3,
      len:  0.06 + Math.random() * 0.30,
      // torque — spin around velocity axis (rifling)
      spin: (8 + Math.random() * 22) * (Math.random() < 0.5 ? 1 : -1),
      angle: 0,
    });
  }
  while (pool.length > MAX_SPARKS) pool.shift();
}

// Continuous edge-scrape sparks — called every frame while near edge.
// intensity: 0..1 edge proximity. pos: world position. tangent: surface tangent dir.
export function emitEdgeScratch(pos, tangent, speed, intensity) {
  if (intensity <= 0) return;
  const count = Math.floor(intensity * 6);
  for (let i = 0; i < count; i++) {
    const scatter = 1.2 + Math.random() * 2.5;
    pool.push({
      x: pos.x + (Math.random() - 0.5) * 0.3,
      y: pos.y + (Math.random() - 0.5) * 0.3,
      z: pos.z + (Math.random() - 0.5) * 0.3,
      vx: tangent.x * scatter * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 1.5,
      vy: tangent.y * scatter * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 1.5,
      vz: speed * (0.2 + Math.random() * 0.5) + (Math.random() - 0.5) * 2,
      age:  0,
      life: 0.15 + Math.random() * 0.35,
      len:  0.04 + Math.random() * 0.12,
      spin: (10 + Math.random() * 18) * (Math.random() < 0.5 ? 1 : -1),
      angle: 0,
    });
  }
  while (pool.length > MAX_SPARKS) pool.shift();
}

// Massive burst on out-of-bounds explosion. inertiaDir: THREE.Vector3 normalised.
export function emitExplosionBurst(pos, inertiaDir, speed) {
  const count = Math.min(MAX_SPARKS - 10, 200);
  const baseImpulse = (speed ?? 20) * 2.0;
  for (let i = 0; i < count; i++) {
    // Bias toward inertia direction with wide scatter
    const biasMix = 0.3 + Math.random() * 0.5;
    const randDir = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();
    const vel = new THREE.Vector3()
      .addScaledVector(inertiaDir, biasMix * baseImpulse * (0.6 + Math.random() * 0.8))
      .addScaledVector(randDir, (1 - biasMix) * baseImpulse * (0.3 + Math.random() * 0.6));
    pool.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: vel.x, vy: vel.y, vz: vel.z,
      age:  0,
      life: 0.6 + Math.random() * 1.8,
      len:  0.08 + Math.random() * 0.45,
      spin: (5 + Math.random() * 25) * (Math.random() < 0.5 ? 1 : -1),
      angle: 0,
    });
  }
  while (pool.length > MAX_SPARKS) pool.shift();
}

export function updateSparks(dt) {
  if (!sparkMesh) return;

  // Physics update
  for (let i = pool.length - 1; i >= 0; i--) {
    const s = pool[i];
    s.age += dt;
    if (s.age >= s.life) { pool.splice(i, 1); continue; }
    const drag = Math.exp(-2.5 * dt);
    s.vx *= drag;
    s.vy *= drag;
    s.vz *= Math.exp(-0.7 * dt);  // Z decays slower — wind effect
    s.x  += s.vx * dt;
    s.y  += s.vy * dt;
    s.z  += s.vz * dt;
    s.angle += s.spin * dt;
  }

  // Upload to InstancedMesh
  const n = pool.length;
  for (let i = 0; i < MAX_SPARKS; i++) {
    if (i >= n) { sparkMesh.setMatrixAt(i, _hidden); continue; }
    const s = pool[i];
    const t = s.age / s.life;

    _vel.set(s.vx, s.vy, s.vz);
    const vLen      = _vel.length();
    const motionLen = s.len + vLen * 0.035;  // longer when fast = motion blur

    _dummy.position.set(s.x, s.y, s.z);
    if (vLen > 0.1) {
      _vel.normalize();
      _q.setFromUnitVectors(_up, _vel);
    } else {
      _q.identity();
    }
    // spin around velocity axis (local Y = forward direction)
    _qSpin.setFromAxisAngle(_up, s.angle);
    _dummy.quaternion.copy(_q).multiply(_qSpin);
    _dummy.scale.set(1, motionLen, 1);
    _dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, _dummy.matrix);

    // Colour: bright orange → deep red → fade out with metallic flicker
    const flicker = 0.75 + 0.25 * (Math.random() > 0.4 ? 1 : 0);
    const alpha   = Math.pow(1 - t, 1.5) * flicker;
    _col.setRGB(
      1.0 * alpha,
      Math.max(0, 0.70 - t * 0.90) * alpha,
      Math.max(0, 0.06 - t * 0.06) * alpha,
    );
    sparkMesh.setColorAt(i, _col);
  }

  sparkMesh.count = n;
  sparkMesh.instanceMatrix.needsUpdate = true;
  if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
}
