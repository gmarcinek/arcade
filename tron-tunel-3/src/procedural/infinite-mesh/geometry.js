import * as THREE from 'three';
import { RING_COUNT, RADIAL_SEGS } from './constants.js';

// Build a (RING_COUNT+1) × (RADIAL_SEGS+1) grid as a single indexed
// BufferGeometry. Positions and normals are DynamicDrawUsage — they are
// rewritten every frame by vertex-update.js. UVs are static.
//
// Returns:
//   geometry   — the THREE.BufferGeometry, ready to attach to a Mesh.
//   vertCols   — RADIAL_SEGS + 1 (useful for indexing into pos/normal arrays).
//   vertRows   — RING_COUNT + 1.

export function buildGeometry() {
  const VERT_COLS = RADIAL_SEGS + 1;
  const VERT_ROWS = RING_COUNT  + 1;
  const vertCount = VERT_ROWS * VERT_COLS;

  const positions = new Float32Array(vertCount * 3);
  const normals   = new Float32Array(vertCount * 3);
  const uvs       = new Float32Array(vertCount * 2);

  for (let r = 0; r <= RING_COUNT; r++) {
    for (let c = 0; c <= RADIAL_SEGS; c++) {
      const vi = r * VERT_COLS + c;
      uvs[vi * 2 + 0] = c / RADIAL_SEGS;
      uvs[vi * 2 + 1] = r / RING_COUNT;
    }
  }

  const indices = [];
  for (let r = 0; r < RING_COUNT; r++) {
    for (let c = 0; c < RADIAL_SEGS; c++) {
      const a = r       * VERT_COLS + c;
      const b = r       * VERT_COLS + c + 1;
      const d = (r + 1) * VERT_COLS + c;
      const e = (r + 1) * VERT_COLS + c + 1;
      indices.push(a, b, e, a, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return { geometry: geo, vertCols: VERT_COLS, vertRows: VERT_ROWS };
}
