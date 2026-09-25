import * as CANNON from 'cannon-es';

// Jedna wypukła bryła nadwozia (zamiast 3 schodkowych pudełek, których półki się zazębiały).
// Poziomy: spód → "ramię" (pionowe ściany do wysokości zderzaków innych aut) → dach.
// Narożniki ścięte pod 45°, żeby auta ześlizgiwały się z siebie zamiast zahaczać.
const LEVELS = [
  { y: -0.30, halfW: 1.10, front:  2.30, back: -2.30, chamfer: 0.35 },
  { y:  0.35, halfW: 1.15, front:  2.35, back: -2.35, chamfer: 0.40 },
  { y:  1.12, halfW: 0.75, front:  1.08, back: -0.92, chamfer: 0.15 },
];

function ring({ y, halfW: w, front: f, back: b, chamfer: c }, off) {
  return [
    [ w - c, y, f], [ w, y, f - c], [ w, y, b + c], [ w - c, y, b],
    [-w + c, y, b], [-w, y, b + c], [-w, y, f - c], [-w + c, y, f],
  ].map(([x, yy, z]) => new CANNON.Vec3(x + off.x, yy + off.y, z + off.z));
}

export function createChassisShape(comOffset) {
  const vertices = LEVELS.flatMap(l => ring(l, comOffset));
  const n = 8;
  const faces = [];
  const top = LEVELS.length - 1;
  faces.push([...Array(n).keys()].reverse());                    // spód (normalna -Y)
  faces.push([...Array(n).keys()].map(i => top * n + i));        // dach (normalna +Y)
  for (let k = 0; k < top; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i]);
    }
  }
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}
