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

const _dummy  = new THREE.Object3D();
const _col    = new THREE.Color();
const _up     = new THREE.Vector3(0, 1, 0);
const _vel    = new THREE.Vector3();
const _q      = new THREE.Quaternion();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export function createSparks(scene) {
  sparkMesh = new THREE.InstancedMesh(_geo, _mat, MAX_SPARKS);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  for (let i = 0; i < MAX_SPARKS; i++) sparkMesh.setMatrixAt(i, _hidden);
  sparkMesh.instanceMatrix.needsUpdate = true;
  scene.add(sparkMesh);
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
      _dummy.quaternion.copy(_q);
    } else {
      _dummy.quaternion.identity();
    }
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
