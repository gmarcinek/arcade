# Details: Morphable Tunnel Cross-Sections

## Metadata

- **Feature**: morphable-tunnel
- **Status**: COMPLETE
- **Plan**: [.copilot-tracking/plans/20260505-100000-morphable-tunnel-plan.md](.copilot-tracking/plans/20260505-100000-morphable-tunnel-plan.md)

---

## Implementation Notes

### Task 1 — Fix timer bug (`main.js`)

- Scope: Wrap existing timer block so it only runs in legacy mode
- Files: `tron-tunel-3/src/main.js` ~line 195 (function `tick()`)
- Pattern: The `if (PROCEDURAL_PLAYER)` guard already exists 4 lines below — add an outer guard

**Exact change** (replace):

```js
// BEFORE
if (state.gameRunning && !state.crashed) {
  state.timeLeft -= dt;

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame(false, startGame);
    return;
  }
}

// AFTER
if (!PROCEDURAL_PLAYER && state.gameRunning && !state.crashed) {
  state.timeLeft -= dt;

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame(false, startGame);
    return;
  }
}
```

- Main check: run procedural mode for >60 s; game must not end

---

### Task 2 — Verify boost visual (`playerSurface.js`)

- Scope: Confirm `state.speed = state.sVelocity` is set each frame so `ball.js` can activate ribbon
- Files: `tron-tunel-3/src/procedural/playerSurface.js` line 52
- **Already present**: `state.speed = state.sVelocity;` is set unconditionally in `updatePlayerSurface()`
- No code change required unless `ball.js` checks a different property
- Main check: search `ball.js` for the property it reads for ribbon — must be `state.speed` or `state.sVelocity`

---

### Task 3 — Create `crossSection.js`

- Scope: New module exporting a factory `createCrossSection()` that reads `PROC_CFG` shape schedule
- Files: `tron-tunel-3/src/procedural/crossSection.js` (CREATE)

```js
import * as THREE from "three";
import { PROC_CFG } from "./proceduralConfig.js";

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// u in [0, 2π], R = radius → {x, y} in cross-section plane
function shapePoint(name, u, R) {
  switch (name) {
    case "circle":
      return { x: R * Math.cos(u), y: R * Math.sin(u) };
    case "triangle":
      return polygonPoint(u, R, 3);
    case "pentagon":
      return polygonPoint(u, R, 5);
    case "halfpipe": {
      const angle = Math.PI + u / 2;
      return { x: R * Math.cos(angle), y: R * Math.sin(angle) };
    }
    case "flat":
      return { x: R * (u / Math.PI - 1), y: 0 };
    default:
      return { x: R * Math.cos(u), y: R * Math.sin(u) };
  }
}

function polygonPoint(u, R, N) {
  const perU = (u / (Math.PI * 2)) * N;
  const side = Math.floor(perU) % N;
  const t = perU - Math.floor(perU);
  const a0 = (side * Math.PI * 2) / N;
  const a1 = ((side + 1) * Math.PI * 2) / N;
  return {
    x: R * (Math.cos(a0) * (1 - t) + Math.cos(a1) * t),
    y: R * (Math.sin(a0) * (1 - t) + Math.sin(a1) * t),
  };
}

export function createCrossSection() {
  const shapes = PROC_CFG.SHAPE_SEQUENCE;
  const interval = PROC_CFG.SHAPE_INTERVAL;
  const transLen = PROC_CFG.TRANSITION_LEN;

  function getBlend(s) {
    const idx = Math.floor(s / interval);
    const phase = (s % interval) / interval;
    const transFrac = transLen / interval;
    return {
      shapeA: shapes[idx % shapes.length],
      shapeB: shapes[(idx + 1) % shapes.length],
      t: phase < transFrac ? smoothstep(0, 1, phase / transFrac) : 1,
    };
  }

  function getPoint(u, s, R) {
    const { shapeA, shapeB, t } = getBlend(s);
    const a = shapePoint(shapeA, u, R);
    const b = shapePoint(shapeB, u, R);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Find u where the cross-section surface point aligns with gravity projected
  // onto the cross-section plane (i.e. the tube floor at arc-length s)
  function getFloorU(s, f, R) {
    const worldDown = new THREE.Vector3(0, -1, 0);
    const gPerp = worldDown
      .clone()
      .addScaledVector(f.tan, -worldDown.dot(f.tan));
    if (gPerp.lengthSq() < 0.0001) return Math.PI;
    gPerp.normalize();
    const gx = gPerp.dot(f.nor);
    const gy = gPerp.dot(f.bin);
    let bestU = Math.PI,
      bestDot = -Infinity;
    for (let i = 0; i < 64; i++) {
      const u = (i / 64) * Math.PI * 2;
      const { x, y } = getPoint(u, s, R);
      const dot = x * gx + y * gy;
      if (dot > bestDot) {
        bestDot = dot;
        bestU = u;
      }
    }
    return bestU;
  }

  return { getPoint, getFloorU };
}
```

- Main checks: `getPoint('halfpipe', 0, 1)` → approx `{x:-1, y:0}`; `getPoint('flat', Math.PI, 1)` → `{x:0, y:0}`

---

### Task 4 — Add shape config to `proceduralConfig.js`

- Scope: Append 3 keys to the existing `PROC_CFG` export
- Files: `tron-tunel-3/src/procedural/proceduralConfig.js` — after `ANGULAR_GRAVITY: 6` on last line

**Exact change** — replace the closing line:

```js
// BEFORE
  ANGULAR_GRAVITY:       6,     // gravity toward tube floor (rad/s²)
};

// AFTER
  ANGULAR_GRAVITY:       6,     // gravity toward tube floor (rad/s²)

  // Cross-section morphing
  SHAPE_SEQUENCE:  ['circle', 'halfpipe', 'circle', 'triangle', 'circle', 'pentagon'],
  SHAPE_INTERVAL:  800,   // meters between shape transitions
  TRANSITION_LEN:  300,   // meters of smoothstep lerp
};
```

- Main check: `import { PROC_CFG } from './proceduralConfig.js'; PROC_CFG.SHAPE_SEQUENCE` → array of 6 strings

---

### Task 5 — Wire cross-section into `infiniteMesh.js`

- Scope: Accept `crossSection` param, call `getPoint()` instead of `cos/sin * TUNNEL_R`
- Files: `tron-tunel-3/src/procedural/infiniteMesh.js`

**5a — Constructor** (line ~176):

```js
// BEFORE
  constructor(scene, spline) {
    this._scene  = scene;
    this._spline = spline;

// AFTER
  constructor(scene, spline, crossSection) {
    this._scene  = scene;
    this._spline = spline;
    this._cs     = crossSection;
```

**5b — Vertex loop in `update()`** (the inner loop, lines ~220-234):

```js
// BEFORE
const u = (c / RADIAL_SEGS) * Math.PI * 2;
const cosU = Math.cos(u);
const sinU = Math.sin(u);

// World position: spline center + cross-section point
const wx = f.pos.x + cosU * TUNNEL_R * f.nor.x + sinU * TUNNEL_R * f.bin.x;
const wy = f.pos.y + cosU * TUNNEL_R * f.nor.y + sinU * TUNNEL_R * f.bin.y;
const wz = f.pos.z + cosU * TUNNEL_R * f.nor.z + sinU * TUNNEL_R * f.bin.z;

// Inward normal (toward tube center = "up" for player on wall)
const nx = -(cosU * f.nor.x + sinU * f.bin.x);
const ny = -(cosU * f.nor.y + sinU * f.bin.y);
const nz = -(cosU * f.nor.z + sinU * f.bin.z);

// AFTER
const u = (c / RADIAL_SEGS) * Math.PI * 2;
const { x: cx, y: cy } = this._cs.getPoint(u, ringS, TUNNEL_R);

// World position: spline center + cross-section offset
const wx = f.pos.x + cx * f.nor.x + cy * f.bin.x;
const wy = f.pos.y + cx * f.nor.y + cy * f.bin.y;
const wz = f.pos.z + cx * f.nor.z + cy * f.bin.z;

// Inward normal (outward direction normalized, then negated)
const len = Math.sqrt(cx * cx + cy * cy) || 1;
const nx = -((cx / len) * f.nor.x + (cy / len) * f.bin.x);
const ny = -((cx / len) * f.nor.y + (cy / len) * f.bin.y);
const nz = -((cx / len) * f.nor.z + (cy / len) * f.bin.z);
```

- Main checks: circle shape still renders identically to before; halfpipe shows an open U cross-section

---

### Task 6 — Update `playerSurface.js`

- Scope: Accept `crossSection` param, replace `_spline.getFloorU()` calls
- Files: `tron-tunel-3/src/procedural/playerSurface.js`

**6a — Module-level variable** (after `let _spline = null;` at line 14):

```js
// AFTER existing let _spline = null;
let _crossSection = null;
```

**6b — `initPlayerSurface` signature + init u** (lines 16-19):

```js
// BEFORE
export function initPlayerSurface(spline) {
  _spline = spline;
  state.s          = 0;
  state.u          = spline.getFloorU(0);

// AFTER
export function initPlayerSurface(spline, crossSection) {
  _spline       = spline;
  _crossSection = crossSection;
  state.s       = 0;
  const initFrame = spline.getFrameAt(0);
  state.u         = crossSection.getFloorU(0, initFrame, TUNNEL_R);
```

**6c — Floor gravity in `updatePlayerSurface()`** (line ~68):

```js
// BEFORE
const floorU = _spline.getFloorU(state.s);

// AFTER
const f_floor = _spline.getFrameAt(state.s);
const floorU = _crossSection.getFloorU(state.s, f_floor, TUNNEL_R);
```

- Main check: halfpipe shape — player falls to bottom of U, not to an arbitrary angle

---

### Task 7 — Update `playerSurfaceBasis.js`

- Scope: Accept `crossSection` param, derive radialDir and position from shape geometry
- Files: `tron-tunel-3/src/procedural/playerSurfaceBasis.js`

**7a — Module-level variable** (after `let _spline = null;` at line 5):

```js
let _crossSection = null;
```

**7b — `initPlayerSurfaceBasis` signature**:

```js
// BEFORE
export function initPlayerSurfaceBasis(spline) {
  _spline = spline;
}

// AFTER
export function initPlayerSurfaceBasis(spline, crossSection) {
  _spline = spline;
  _crossSection = crossSection;
}
```

**7c — `getPlayerFrame()`: radialDir and position** (lines ~22-32):

```js
// BEFORE
const u = state.u;
const cosU = Math.cos(u);
const sinU = Math.sin(u);

// Outward radial direction at angle u
const radialDir = new THREE.Vector3()
  .addScaledVector(f.nor, cosU)
  .addScaledVector(f.bin, sinU)
  .normalize();

// Ball position: on tube wall, moved inward by radialOffset
const position = new THREE.Vector3()
  .copy(f.pos)
  .addScaledVector(radialDir, TUNNEL_R - state.radialOffset);

// AFTER
const u = state.u;
const { x: cx, y: cy } = _crossSection.getPoint(u, state.s, 1.0);

// Outward radial direction (unit vector in cross-section plane)
const radialDir = new THREE.Vector3()
  .addScaledVector(f.nor, cx)
  .addScaledVector(f.bin, cy)
  .normalize();

// Ball position: surface point at TUNNEL_R, moved inward by radialOffset
const position = new THREE.Vector3()
  .copy(f.pos)
  .addScaledVector(f.nor, cx * TUNNEL_R)
  .addScaledVector(f.bin, cy * TUNNEL_R)
  .addScaledVector(radialDir, -state.radialOffset);
```

- Main check: ball position tracks the cross-section wall correctly for halfpipe bottom

---

### Task 8 — Wire in `main.js`

- Scope: Import + instantiate crossSection, pass to all three consumers
- Files: `tron-tunel-3/src/main.js`

**8a — Import** (after existing imports, line ~17):

```js
import { createCrossSection } from "./procedural/crossSection.js";
```

**8b — Instantiation in procedural block** (~line 98-102):

```js
// BEFORE
infiniteSpline = createInfiniteSpline(42);
infiniteSpline.extend(800);
infiniteMeshObj = new InfiniteMesh(scene, infiniteSpline);

// AFTER
infiniteSpline = createInfiniteSpline(42);
infiniteSpline.extend(800);
const crossSection = createCrossSection();
infiniteMeshObj = new InfiniteMesh(scene, infiniteSpline, crossSection);
```

> Note: `crossSection` must be accessible in `startGame()` scope. Hoist to module-level
> (`let crossSection = null;`) and assign in the procedural init block if needed.

**8c — `startGame()` init calls** (~line 168-169):

```js
// BEFORE
initPlayerSurface(infiniteSpline);
initPlayerSurfaceBasis(infiniteSpline);

// AFTER
initPlayerSurface(infiniteSpline, crossSection);
initPlayerSurfaceBasis(infiniteSpline, crossSection);
```

- Main checks: Vite dev server starts without errors; tunnel morphs shape visibly after 800 m

---

## Dependencies

- Tasks 3 + 4 must complete before Tasks 5, 6, 7, 8
- Task 8 requires Tasks 5, 6, 7 complete

## Risks

- `getFloorU` sampling 64 points every frame in `updatePlayerSurface` adds ~0.05 ms/frame — acceptable at 60 fps
- `flat` shape has `y = 0` for all u → normal is zero-length at `cx=0, cy=0`; the `|| 1` guard in the normal calc prevents NaN but the normal will be wrong at the exact center point. Not a real issue since the flat shape spreads across the full width.
- `crossSection` scoping in `main.js`: if the procedural `if` block is not at module scope, `startGame()` may not see the variable. Hoist `let crossSection = null` to module level.
