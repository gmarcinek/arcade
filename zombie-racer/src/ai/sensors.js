// Wspólne "czujniki" otoczenia: statyczne przeszkody jako AABB 2D i raycast w płaszczyźnie XZ.
// Bez zależności — importowane także przez skrypt treningowy w Node.
import { WORLD_SIZE } from '../constants.js';

export const SOFT_BOUNDS     = WORLD_SIZE / 2 - 40;
export const OBSTACLE_MARGIN = 2.8;
const TREE_HALF = 0.8;

let _obstacles = []; // {minX,maxX,minZ,maxZ}, już poszerzone o margines

export function setObstacles(mapData) {
  const m = OBSTACLE_MARGIN;
  _obstacles = [];
  for (const b of (mapData.buildings ?? [])) {
    _obstacles.push({ minX: b.x - b.w / 2 - m, maxX: b.x + b.w / 2 + m, minZ: b.z - b.d / 2 - m, maxZ: b.z + b.d / 2 + m });
  }
  for (const t of (mapData.trees ?? [])) {
    const h = TREE_HALF + m;
    _obstacles.push({ minX: t.x - h, maxX: t.x + h, minZ: t.z - h, maxZ: t.z + h });
  }
}

export function insideObstacle(x, z) {
  for (const b of _obstacles) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  }
  return false;
}

export function gatherStatic(x, z, r, out) {
  out.length = 0;
  for (const b of _obstacles) {
    if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
    out.push(b);
  }
  return out;
}

// Odległość wzdłuż promienia do AABB; start wewnątrz blokuje tylko kierunek w głąb.
function rayBox(ox, oz, dx, dz, b, maxD) {
  if (ox > b.minX && ox < b.maxX && oz > b.minZ && oz < b.maxZ) {
    const dl = ox - b.minX, dr = b.maxX - ox, db = oz - b.minZ, df = b.maxZ - oz;
    const m = Math.min(dl, dr, db, df);
    const inward = m === dl ? dx : m === dr ? -dx : m === db ? dz : -dz;
    return inward > 0.3 ? 0 : maxD;
  }
  let tmin = 0, tmax = maxD;
  if (Math.abs(dx) < 1e-6) {
    if (ox < b.minX || ox > b.maxX) return maxD;
  } else {
    let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxD;
  }
  if (Math.abs(dz) < 1e-6) {
    if (oz < b.minZ || oz > b.maxZ) return maxD;
  } else {
    let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxD;
  }
  return tmin;
}

// Najbliższa przeszkoda z `boxes` lub miękka granica mapy wzdłuż (dx,dz) — max maxD.
export function rayDist(ox, oz, dx, dz, maxD, boxes) {
  let t = maxD;
  if (dx >  1e-4) t = Math.min(t, (SOFT_BOUNDS - ox) / dx);
  if (dx < -1e-4) t = Math.min(t, (-SOFT_BOUNDS - ox) / dx);
  if (dz >  1e-4) t = Math.min(t, (SOFT_BOUNDS - oz) / dz);
  if (dz < -1e-4) t = Math.min(t, (-SOFT_BOUNDS - oz) / dz);
  t = Math.max(0, t);
  for (const b of boxes) {
    const d = rayBox(ox, oz, dx, dz, b, t);
    if (d < t) t = d;
  }
  return t;
}
