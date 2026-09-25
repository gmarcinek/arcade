// Wektor obserwacji dla sieci jazdy — identyczny dla nagrywanego gracza i sterowanego NPC.
// Konwencja kątów: dodatni = w lewo (rosnący yaw). Akcja steer: +1 = w prawo.
import { gatherStatic, rayDist } from './sensors.js';

export const FEATURE_VERSION = 2;
export const RAY_LEN    = 40;
// Gęsto z przodu, rzadko z boku, jeden do tyłu (do cofania)
export const RAY_ANGLES = [-100, -60, -35, -18, -6, 0, 6, 18, 35, 60, 100, 180].map(d => d * Math.PI / 180);
export const FOV_HALF   = 70 * Math.PI / 180;  // cel widoczny tylko w stożku ±70° od przodu
export const VIEW_DIST  = 150;                 // m — zasięg wzroku (dalej cel jest niewidoczny)
export const MEMORY_S   = 5;                   // s — normalizacja wieku pamięci o celu

export const FEATURE_NAMES = [
  'fwdSpeed', 'latSpeed', 'yawRate', 'hp',
  ...RAY_ANGLES.map((_, i) => `ray${i}`),
  'tgtSin', 'tgtCos', 'tgtDist', 'tgtClose', 'tgtRelFwd', 'tgtRelLat', 'tgtVisible', 'tgtMemAge',
  'upY', 'roll', 'pitch', 'wheels',
];
export const ACTION_NAMES  = ['steer', 'throttle', 'brake', 'boost'];
export const FEATURE_COUNT = FEATURE_NAMES.length;
export const ACTION_COUNT  = ACTION_NAMES.length;
export const EGO_COUNT     = 4 + RAY_ANGLES.length;
export const TGT_OFFSET    = EGO_COUNT;
export const ATT_OFFSET    = TGT_OFFSET + 8;
// yawRate jest skutkiem skrętu, nie przyczyną — sieć uczyła się z niego skręcać i kręciła ósemki.
export const DISABLED_FEATURES = [2];

const _near = [];
const _los  = [];

function _wrap(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Fizyczny przód auta to lokalne +Z.
export function bodyPose(body, out = {}) {
  const q = body.quaternion;
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const h  = Math.atan2(fx, fz);
  const v  = body.velocity;
  // lokalna oś "góra" auta w świecie — porównywana z pionem grawitacji
  const ux = 2 * (q.x * q.y - q.w * q.z);
  const uz = 2 * (q.y * q.z + q.w * q.x);
  const s = Math.sin(h), c = Math.cos(h);
  out.x = body.position.x;
  out.z = body.position.z;
  out.heading  = h;
  out.vx = v.x;
  out.vz = v.z;
  out.fwdSpeed = v.x * s + v.z * c;
  out.latSpeed = v.x * c - v.z * s;
  out.yawRate  = body.angularVelocity.y;
  out.upY      = 1 - 2 * (q.x * q.x + q.z * q.z);
  out.roll     = ux * c - uz * s;
  out.pitch    = ux * s + uz * c;
  return out;
}

export function carPose(car, out = {}) {
  bodyPose(car.chassisBody, out);
  let n = 0;
  // isInContact zeruje updateWheelTransform() (wołane przy rysowaniu kół) — hasHit zostaje z kroku fizyki
  if (car.vehicle) for (const w of car.vehicle.wheelInfos) if (w.raycastResult.hasHit) n++;
  out.wheels = n / 4;
  return out;
}

// Bez kół na ziemi (lot, dach) skręt i gaz nic nie robią — takich chwil nie uczymy.
export function isSteerable(pose) {
  return pose.wheels > 0 && pose.upY > 0.3;
}

// Część niezależna od celu: prędkości, HP i promienie do przeszkód (0 = wolne, 1 = styk).
export function egoFeatures(pose, hpRatio, out, offset = 0) {
  out[offset + 0] = pose.fwdSpeed / 40;
  out[offset + 1] = pose.latSpeed / 20;
  out[offset + 2] = 0; // DISABLED_FEATURES
  out[offset + 3] = hpRatio;
  gatherStatic(pose.x, pose.z, RAY_LEN + 1, _near);
  for (let i = 0; i < RAY_ANGLES.length; i++) {
    const a = pose.heading + RAY_ANGLES[i];
    const d = rayDist(pose.x, pose.z, Math.sin(a), Math.cos(a), RAY_LEN, _near);
    out[offset + 4 + i] = 1 - d / RAY_LEN;
  }
  return out;
}

export function attitudeFeatures(pose, out, offset = ATT_OFFSET) {
  out[offset + 0] = pose.upY;
  out[offset + 1] = pose.roll;
  out[offset + 2] = pose.pitch;
  out[offset + 3] = pose.wheels ?? 1;
  return out;
}

export function createTargetMemory() {
  return { x: 0, z: 0, vx: 0, vz: 0, seenAt: -Infinity };
}

// Widzenie celu: stożek FOV + zasięg + brak budynku na linii wzroku. Aktualizuje pamięć.
export function perceiveTarget(pose, tx, tz, tvx, tvz, mem, t) {
  const dx = tx - pose.x, dz = tz - pose.z;
  const dist = Math.hypot(dx, dz);
  const rel  = _wrap(Math.atan2(dx, dz) - pose.heading);
  let visible = dist < 1 || (Math.abs(rel) <= FOV_HALF && dist <= VIEW_DIST);
  if (visible && dist >= 1) {
    gatherStatic(pose.x, pose.z, dist + 1, _los);
    visible = rayDist(pose.x, pose.z, dx / dist, dz / dist, dist, _los) >= dist - 1;
  }
  if (visible) {
    mem.x = tx; mem.z = tz; mem.vx = tvx; mem.vz = tvz; mem.seenAt = t;
  }
  return visible;
}

// Cechy celu z pamięci (przy widocznym celu = jego aktualna pozycja).
export function targetFeatures(pose, mem, visible, t, out, offset = TGT_OFFSET) {
  const age = t - mem.seenAt;
  if (!Number.isFinite(age)) {
    out[offset + 0] = 0; out[offset + 1] = 0; out[offset + 2] = 1; out[offset + 3] = 0;
    out[offset + 4] = 0; out[offset + 5] = 0; out[offset + 6] = 0; out[offset + 7] = 1;
    return out;
  }
  const dx = mem.x - pose.x, dz = mem.z - pose.z;
  const dist = Math.hypot(dx, dz);
  const rel  = _wrap(Math.atan2(dx, dz) - pose.heading);
  const s = Math.sin(pose.heading), c = Math.cos(pose.heading);
  const rvx = mem.vx - pose.vx, rvz = mem.vz - pose.vz;
  out[offset + 0] = Math.sin(rel);
  out[offset + 1] = Math.cos(rel);
  out[offset + 2] = Math.min(dist, 150) / 150;
  out[offset + 3] = 1 / (1 + dist / 10);
  out[offset + 4] = (rvx * s + rvz * c) / 30;
  out[offset + 5] = (rvx * c - rvz * s) / 30;
  out[offset + 6] = visible ? 1 : 0;
  out[offset + 7] = Math.min(1, age / MEMORY_S);
  return out;
}

// Lustrzane odbicie lewo↔prawo (augmentacja danych): row = [features..., actions...].
const _mirrorRay = RAY_ANGLES.map(a => {
  const j = RAY_ANGLES.findIndex(b => Math.abs(_wrap(b + a)) < 1e-6);
  return j === -1 ? RAY_ANGLES.indexOf(a) : j;
});
const _NEGATE = [1, 2, TGT_OFFSET + 0, TGT_OFFSET + 5, ATT_OFFSET + 1, FEATURE_COUNT + 0];

export function mirrorRow(row) {
  const m = row.slice();
  for (let i = 0; i < RAY_ANGLES.length; i++) m[4 + i] = row[4 + _mirrorRay[i]];
  for (const i of _NEGATE) m[i] = -row[i];
  return m;
}
