# Details: tron-tunel-3 Procedural Surface System — Milestone 1

## Metadata

- **Feature**: tron-tunel-3-milestone1
- **Status**: COMPLETE
- **Plan**: [.copilot-tracking/plans/20260504-120000-tron-tunel-3-milestone1.md](../plans/20260504-120000-tron-tunel-3-milestone1.md)

---

## Implementation Notes

### Task 1 — `src/procedural/math.js`

- Scope: Pure utility math, no Three.js dependency
- Files: `tron-tunel-3/src/procedural/math.js`
- Pattern: standalone ES module, export named functions
- Algorithm — mulberry32 RNG:
  ```js
  export function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ```
- Also export: `lerp(a,b,t)`, `clamp(v,lo,hi)`, `smoothstep(a,b,t)`, `mapRange(v,a,b,c,d)`
- Main checks: `mulberry32(42)()` returns same value on repeated calls with same seed

---

### Task 2 — `src/procedural/curves.js`

- Scope: CatmullRom wrapper + RMF (Rotation Minimizing Frame / parallel transport)
- Files: `tron-tunel-3/src/procedural/curves.js`
- Pattern: export factory `buildCurve(points, closed=false)` returning `{ curve, length, getFrame(t) }`
- Algorithm — parallel transport RMF:
  1. Pre-compute N samples (e.g. 256) along the curve at startup
  2. Seed initial frame: `tangent_0 = curve.getTangentAt(0).normalize()`, pick arbitrary `normal_0` perpendicular to `tangent_0`
  3. For each step i→i+1: project previous normal onto plane perpendicular to new tangent:
     ```
     normal_i+1 = normalize(normal_i - dot(normal_i, tangent_i+1) * tangent_i+1)
     binormal_i+1 = cross(tangent_i+1, normal_i+1)
     ```
  4. Store frames array; `getFrame(t)` interpolates between stored frames
- `getFrame(t)` returns `{ position: Vector3, tangent: Vector3, normal: Vector3, binormal: Vector3 }`
- Do NOT use `THREE.FrenetFrames` (has flip problem)
- Main checks: `getFrame(0.5).normal` is perpendicular to `getFrame(0.5).tangent`; no sudden flip visible across t=0..1

---

### Task 3 — `src/procedural/surfaceTypes.js`

- Scope: Factory functions for plain JS data objects — no Three.js, no logic
- Files: `tron-tunel-3/src/procedural/surfaceTypes.js`
- Exports:
  ```js
  makeSurfaceSegment({ id, kind, centerline, length, radius, safeTracks });
  makeSafeTrack({ id, surfaceId, samples });
  makeSafeTrackSample(s, u, width);
  // SurfaceFrame shape (doc comment only — created inline in surfaceSegment.js):
  // { position, normal, tangent, binormal, up, right, forward }
  ```
- Main checks: returned objects have all required keys

---

### Task 4 — `src/procedural/surfaceSegment.js`

- Scope: Geometry math for `tube-inner` surface only in M1
- Files: `tron-tunel-3/src/procedural/surfaceSegment.js`
- Pattern: export class `SurfaceSegment` with constructor receiving a data object from `surfaceTypes.js`
- Key method `getFrame(s, u, radialOffset)`:
  ```
  t = s / segment.length                          // normalize to [0,1]
  curveFrame = centerline.getFrame(t)             // RMF frame
  r = segment.radius + radialOffset               // tube radius ± offset
  // tube-inner: normal points toward tube center (inward)
  normal   = curveFrame.normal * cos(u) + curveFrame.binormal * sin(u)
  position = curveFrame.position + normal * r
  up       = -normal                              // into tube center
  right    = normalize(cross(curveFrame.tangent, normal))
  forward  = curveFrame.tangent
  ```
  Returns `{ position, normal, tangent: forward, binormal: right, up, right, forward }`
- Also export: `getPoint(s, u)`, `getNormal(s, u)`, `getTangent(s)`
- Main checks: `getFrame(0, 0, 0).position` lies at `radius` distance from centerline; frame vectors are mutually orthogonal

---

### Task 5 — `src/procedural/safeTrack.js`

- Scope: SafeTrack query logic, no Three.js
- Files: `tron-tunel-3/src/procedural/safeTrack.js`
- Export class `SafeTrack` wrapping the data object from `surfaceTypes.js`
- `getSafeInfo(s, u)`:
  1. Find nearest sample by `s` (binary search or linear scan on `samples` array)
  2. Interpolate `u_center` and `width` from nearest two samples
  3. `distU = angleDiff(u, u_center)` (wrap-around angle difference)
  4. `onSafeTrack = Math.abs(distU) <= width / 2`
  5. `dangerLevel = clamp(Math.abs(distU) / (width / 2) - 1, 0, 1)`
  6. Return `{ onSafeTrack, width, dangerLevel, distToCenter: distU }`
- Main checks: center of track → `onSafeTrack: true`; `u + Math.PI` → `onSafeTrack: false`

---

### Task 6 — `src/procedural/trackWorld.js`

- Scope: Container + query dispatcher
- Files: `tron-tunel-3/src/procedural/trackWorld.js`
- Export class `TrackWorld`:
  ```js
  constructor(seed, surfaces); // surfaces: SurfaceSegment[]
  getFrame(surfaceId, s, u, radialOffset); // delegates to SurfaceSegment.getFrame
  query(surfaceId, s, u); // delegates to getSafeInfo + adds canLand, inGap, nearestTrackId
  getSafeInfo(surfaceId, s, u); // delegates to SafeTrack.getSafeInfo
  ```
- Internal `_map`: `Map<id, SurfaceSegment>` for O(1) lookup
- Main checks: `getFrame` result is a valid SurfaceFrame; `query` on unknown id throws descriptive error

---

### Task 7 — `src/procedural/generateDemoTrack.js`

- Scope: Seeded generation of one demo `tube-inner` segment
- Files: `tron-tunel-3/src/procedural/generateDemoTrack.js`
- Export: `generateDemoTrack(seed = 42)` → `TrackWorld`
- Centerline generation:
  ```js
  const rng = mulberry32(seed);
  // 7 control points distributed along Z axis, ~400 units total
  // Y and X offsets randomized ±20 units for curve interest
  const pts = Array.from(
    { length: 7 },
    (_, i) =>
      new THREE.Vector3((rng() - 0.5) * 40, (rng() - 0.5) * 40, i * (400 / 6)),
  );
  ```
- Radius: import `TUNNEL_R` from `'../config.js'`; use as `radius`
- SafeTrack generation: 60 samples along s=0..400, `u(s) = sin(s * 0.08) * 1.2` (sinusoidal winding), constant `width = 1.0` (radians, ~12 units arc at r=12)
- Assemble with `makeSurfaceSegment`, `makeSafeTrack`, `makeSafeTrackSample`, wrap in `SurfaceSegment`, `SafeTrack`, `TrackWorld`
- Main checks: `trackWorld.surfaces.length === 1`; `trackWorld.surfaces[0].safeTracks.length === 1`; second call with same seed returns same first control point

---

### Task 8 — `src/procedural/debugTrackRenderer.js`

- Scope: Three.js debug visualization, no game logic
- Files: `tron-tunel-3/src/procedural/debugTrackRenderer.js`
- Export class `DebugTrackRenderer`:
  ```js
  constructor(trackWorld);
  addToScene(scene); // creates and adds THREE.Line objects
  removeFromScene(scene); // removes all debug objects
  setVisible(bool); // toggles .visible on all lines
  ```
- Line construction pattern:
  ```js
  // shared helper
  function makeLine(points, color) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }
  ```
- Three line sets (200 samples each along s = 0..segment.length):
  1. **White** `0xffffff` — centerline: `segment.centerline.getFrame(t).position`
  2. **Orange** `0xff6600` — safe track centerline: `segment.getFrame(s, track.samples[i].u, 0).position`
  3. **Blue (×2)** `0x0088ff` — safe track edges: `getFrame(s, u ± halfWidth, 0).position`
- All geometries disposed on `removeFromScene`
- Main checks: `scene.children` gains exactly 4 new Line objects after `addToScene`

---

### Task 9 — Integration in `src/main.js`

- Scope: Minimal — 3 imports + 1 const + 4 init lines; zero changes to game loop or physics
- Files: `tron-tunel-3/src/main.js`
- Add at top (after existing imports):

  ```js
  import { generateDemoTrack } from "./procedural/generateDemoTrack.js";
  import { DebugTrackRenderer } from "./procedural/debugTrackRenderer.js";

  const PROCEDURAL_DEBUG = true; // set false to hide debug overlay
  ```

- Add after `createSparks(scene);`:
  ```js
  // ---- Procedural debug overlay ----
  const trackWorld = generateDemoTrack(42);
  const debugRenderer = new DebugTrackRenderer(trackWorld);
  debugRenderer.addToScene(scene);
  debugRenderer.setVisible(PROCEDURAL_DEBUG);
  ```
- No other changes — game loop, physics, camera, tunnel remain untouched
- Main checks: colored lines visible when flag is `true`; existing game plays normally with flag `false`

---

## Implementation Order (dependency chain)

```
math.js
  └── curves.js
        └── surfaceTypes.js
              └── surfaceSegment.js
                    └── safeTrack.js
                          └── trackWorld.js
                                └── generateDemoTrack.js
                                      └── debugTrackRenderer.js
                                            └── main.js (integration)
```

---

## Key Algorithm: RMF (Rotation Minimizing Frame)

Preferred over Frenet because Frenet flips when curvature passes zero (straight segments).  
RMF "parallel transports" the normal vector — it only rotates as much as the tangent rotates, never more.

Steps during pre-computation in `curves.js`:

1. Sample N=256 points along curve uniformly by arc length
2. Seed frame at t=0: pick `normal_0` perpendicular to `tangent_0` (use `THREE.Vector3.cross` with a world-up, fallback to world-right if near-parallel)
3. Transport: for each consecutive pair `(tangent_i, tangent_{i+1})`, double-reflect `normal_i` to get `normal_{i+1}` using the reflection formula (Bishop frame transport)
4. Cache all frames; `getFrame(t)` lerps between cached neighbors

---

## Risks

- RMF seeding near vertical centerline tangents: if first tangent is `(0,1,0)`, cross with world-up `(0,1,0)` → zero vector. Guard: if `|cross(tangent, UP)| < 0.001`, use `cross(tangent, RIGHT)` instead.
- `THREE.CatmullRomCurve3.getUtoTmapping` is slow for many samples; pre-cache arc-length-parameterized t values in `buildCurve`.
