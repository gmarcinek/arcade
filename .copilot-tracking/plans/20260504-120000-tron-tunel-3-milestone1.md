# Plan: tron-tunel-3 Procedural Surface System — Milestone 1

## Metadata

- **Feature**: tron-tunel-3-milestone1
- **Status**: COMPLETE
- **Research**: `tron-tunel-3/handof/handof.md`
- **Details**: [.copilot-tracking/details/20260504-120000-tron-tunel-3-milestone1.md](../details/20260504-120000-tron-tunel-3-milestone1.md)

---

## Goal

Add a `src/procedural/` subsystem that generates one `tube-inner` SurfaceSegment with a 3D curved CatmullRom centerline and one SafeTrack winding around it. Expose a debug renderer that overlays colored Three.js lines on the existing scene. Existing game physics and tunnel are **completely untouched**.

---

## MUST-HAVE

- [ ] **Task 1 — math.js**: Seeded RNG (mulberry32), `lerp`, `clamp`, `smoothstep`, `mapRange`
  - Files: `tron-tunel-3/src/procedural/math.js`
  - Verify: `rng(seed)()` returns same float sequence for same seed

- [ ] **Task 2 — curves.js**: Wrap `THREE.CatmullRomCurve3` with RMF (parallel-transport) frame sampling
  - Files: `tron-tunel-3/src/procedural/curves.js`
  - Exports: `buildCurve(points)` → `{ curve, getFrame(t) }` where `getFrame` returns `{ position, tangent, normal, binormal }` using parallel transport; no Frenet flips
  - Verify: `getFrame(0.5).tangent` is unit-length and continuous across full t range

- [ ] **Task 3 — surfaceTypes.js**: JS object constants / factory functions for SurfaceSegment, SafeTrack, SafeTrackSample, SurfaceFrame
  - Files: `tron-tunel-3/src/procedural/surfaceTypes.js`
  - Exports: `makeSurfaceSegment(...)`, `makeSafeTrack(...)`, `makeSafeTrackSample(s, u, width)`
  - Verify: factory functions return plain objects with correct shape

- [ ] **Task 4 — surfaceSegment.js**: SurfaceSegment logic — `getFrame(s, u, radialOffset)`, `getPoint(s, u)`, `getNormal(s)`, `getTangent(s)`
  - Files: `tron-tunel-3/src/procedural/surfaceSegment.js`
  - Depends on: `curves.js`, `surfaceTypes.js`
  - Verify: `getFrame(id, 0, 0, 0).position` lies on tube surface; `getFrame(id, 0, Math.PI, 0).position` is diametrically opposite

- [ ] **Task 5 — safeTrack.js**: SafeTrack query — `getSafeInfo(s, u)` → `{ onSafeTrack, width, dangerLevel }`
  - Files: `tron-tunel-3/src/procedural/safeTrack.js`
  - Depends on: `surfaceTypes.js`, `math.js`
  - Verify: point at track center returns `onSafeTrack: true`; point far from track returns `onSafeTrack: false`

- [ ] **Task 6 — trackWorld.js**: TrackWorld container — `getFrame(surfaceId, s, u, radialOffset)`, `query(surfaceId, s, u)`, `getSafeInfo(surfaceId, s, u)`
  - Files: `tron-tunel-3/src/procedural/trackWorld.js`
  - Depends on: `surfaceSegment.js`, `safeTrack.js`
  - Verify: `getFrame` returns a valid SurfaceFrame object; `query` returns `{ onSafeTrack, canLand, dangerLevel, ... }`

- [ ] **Task 7 — generateDemoTrack.js**: Seeded generator — one `tube-inner` segment, CatmullRom centerline with 6–8 control points, length ~400 units, radius = `TUNNEL_R` (12), one sinusoidal winding SafeTrack
  - Files: `tron-tunel-3/src/procedural/generateDemoTrack.js`
  - Depends on: `math.js`, `curves.js`, `surfaceSegment.js`, `safeTrack.js`, `trackWorld.js`, `surfaceTypes.js`
  - Imports `TUNNEL_R` from `../config.js`
  - Export: `generateDemoTrack(seed)` → `TrackWorld`
  - Verify: same seed → identical `trackWorld.surfaces[0].centerline` control points

- [ ] **Task 8 — debugTrackRenderer.js**: Three.js debug lines — white centerline, orange safe track centerline, blue safe track edges
  - Files: `tron-tunel-3/src/procedural/debugTrackRenderer.js`
  - Depends on: `trackWorld.js`, `surfaceSegment.js`, `safeTrack.js`
  - Exports: `DebugTrackRenderer` class with `addToScene(scene)`, `removeFromScene(scene)`, `setVisible(bool)`
  - All lines as `THREE.Line` with `THREE.BufferGeometry`; 200 samples along s for resolution
  - Verify: scene contains 3 line objects after `addToScene`

- [ ] **Task 9 — Integration in main.js**: Import `generateDemoTrack`, `DebugTrackRenderer`; add `PROCEDURAL_DEBUG` flag; generate track on startup; toggle line visibility
  - Files: `tron-tunel-3/src/main.js` (minimal additions only)
  - Changes: 3 import lines at top + flag constant + 4 lines of init code after `createSparks(scene)`
  - Verify: `PROCEDURAL_DEBUG = true` → colored lines visible; `false` → lines hidden; existing game runs identically in both modes

---

## NICE-TO-HAVE

- [ ] **Task 10 — Golden path line**: Compute the average track center as a "golden path" and render it as a distinct orange-dashed line (simulate dashes by alternating point density)
  - Files: `tron-tunel-3/src/procedural/debugTrackRenderer.js`
  - Verify: orange line visually follows the safe track sinusoid around the tube

---

## Dependencies

- `THREE.CatmullRomCurve3` already available via `import * as THREE from 'three'`
- `TUNNEL_R = 12` from `tron-tunel-3/src/config.js` — reuse in generator
- No new npm packages; no build config changes

---

## Open Questions

- none

---

## Effort

Medium
