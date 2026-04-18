// ═══════════════════════════════════════════════
//  Block Dock – shapes.js
//  Canonical shapes from docs + auto-generated
//  rotations and mirrors.
// ═══════════════════════════════════════════════

// ── Canonical shape definitions ─────────────────
// Based on the allowed piece types (docs.txt).
// Each shape is defined once in its base orientation.
// c: [[col, row], ...]  (0-indexed, top-left = 0,0)
// g: minimum grid size required to include this shape
//
// All rotations (0°/90°/180°/270°) and horizontal
// mirrors are generated automatically — duplicates
// (shapes identical after transformation) are skipped.

const CANONICAL_SHAPES = [

  // ── Kropka (1-cell dot) ─────────────────────────
  { name: 'Kropka',          c: [[0,0]],                          g: 6 },

  // ── Deski (straight lines) ──────────────────────
  // 2-cell and 3-cell fit any grid; 4+ need room.
  { name: 'Deska 2x',        c: [[0,0],[1,0]],                    g: 6 },
  { name: 'Deska 3x',        c: [[0,0],[1,0],[2,0]],              g: 6 },
  { name: 'Deska 4x',        c: [[0,0],[1,0],[2,0],[3,0]],        g: 9 },
  { name: 'Deska 5x',        c: [[0,0],[1,0],[2,0],[3,0],[4,0]],  g: 9 },

  // ── Narożnik krótki (4-cell short-L) ────────────
  //  ##
  //  #
  //  #
  { name: 'Narożnik krótki', c: [[0,0],[1,0],[0,1],[0,2]],        g: 6 },

  // ── Narożnik długi (5-cell long-L) ──────────────
  //  ###
  //  #
  //  #
  { name: 'Narożnik długi',  c: [[0,0],[1,0],[2,0],[0,1],[0,2]],  g: 6 },

  // ── U szejp (5-cell U-shape) ─────────────────────
  //  ##
  //  #
  //  ##
  { name: 'U szejp',         c: [[0,0],[1,0],[0,1],[0,2],[1,2]],  g: 6 },

  // ── Krzyż (5-cell plus / cross) ──────────────────
  //  .#.
  //  ###
  //  .#.
  { name: 'Krzyż',           c: [[1,0],[0,1],[1,1],[2,1],[1,2]],  g: 6 },

  // ── Trapez (4-cell T-shape) ──────────────────────
  //  .#.
  //  ###
  { name: 'Trapez',          c: [[1,0],[0,1],[1,1],[2,1]],        g: 6 },

  // ── Skos (3-cell diagonal) ───────────────────────
  //  ..#
  //  .#.
  //  #..
  { name: 'Skos',            c: [[0,0],[1,1],[2,2]],              g: 6 },

  // ── Klocek S/Z (4-cell skew) ─────────────────────
  //  ##.
  //  .##
  { name: 'Klocek S',        c: [[0,0],[1,0],[1,1],[2,1]],        g: 6 },

  // ── Kwadrat 2×2 ──────────────────────────────────
  //  ##
  //  ##
  { name: 'Kwadrat 2x2',     c: [[0,0],[1,0],[0,1],[1,1]],        g: 6 },

];

// ── Shape-variant generator ──────────────────────

function _normalizeShape(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function _rotate90(cells) {
  // 90° clockwise: (x, y) → (y, −x)
  return _normalizeShape(cells.map(([x, y]) => [y, -x]));
}

function _mirrorH(cells) {
  // Horizontal mirror: (x, y) → (−x, y)
  return _normalizeShape(cells.map(([x, y]) => [-x, y]));
}

function _shapeKey(cells) {
  return _normalizeShape(cells)
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join('|');
}

// Returns all unique rotations + mirrors of a shape.
function _generateVariants(cells, g) {
  const seen = new Set();
  const variants = [];
  let cur = _normalizeShape(cells);

  for (let r = 0; r < 4; r++) {
    for (const candidate of [cur, _mirrorH(cur)]) {
      const key = _shapeKey(candidate);
      if (!seen.has(key)) {
        seen.add(key);
        variants.push({ c: candidate.map(([x, y]) => [x, y]), g });
      }
    }
    cur = _rotate90(cur);
  }
  return variants;
}

// ── Build ALL_SHAPES from canonical list ─────────
const ALL_SHAPES = [];
for (const shape of CANONICAL_SHAPES) {
  ALL_SHAPES.push(..._generateVariants(shape.c, shape.g));
}
