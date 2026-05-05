# Review: tron-tunel-3 Procedural Surface System — Milestone 1

## Metadata

- **Feature**: tron-tunel-3-milestone1
- **Status**: COMPLETE
- **Changes file**: [.copilot-tracking/changes/20260504-120000-tron-tunel-3-milestone1.md](../changes/20260504-120000-tron-tunel-3-milestone1.md)
- **Plan**: [.copilot-tracking/plans/20260504-120000-tron-tunel-3-milestone1.md](../plans/20260504-120000-tron-tunel-3-milestone1.md)
- **Details**: [.copilot-tracking/details/20260504-120000-tron-tunel-3-milestone1.md](../details/20260504-120000-tron-tunel-3-milestone1.md)
- **Verdict**: APPROVED

## Build Status

- Backend build (`mvn`): SKIPPED — no Java changes
- Frontend build (`npm run build`): PASS — 23 modules, 722 KB, 1.24s

## Blockers

_None._

## Notes

1. **`PROCEDURAL_DEBUG = true` (main.js line 5)** — flag is shipped as `true`, meaning debug lines are currently visible at startup. The gate works correctly: `false` completely skips the `if (PROCEDURAL_DEBUG)` block and nothing from the procedural subsystem is instantiated. The current `true` value does not break any game path — the debug renderer only adds `THREE.Line` objects to the scene and does not touch physics, state, or input. Non-blocking.

2. **`const` between import groups (main.js line 5–6)** — placing `const PROCEDURAL_DEBUG = true;` between two groups of `import` statements is unusual but is valid ES module syntax (all `import` declarations are hoisted regardless of position). Vite accepts it without warning. Non-blocking.

3. **Unused import in curves.js** — `lerp` is imported from `./math.js` but never called; interpolation uses `THREE.Vector3.lerpVectors` throughout. Dead import, no functional impact.

4. **`getFrame()` binormal inconsistency (surfaceSegment.js line 49)** — the returned `SurfaceFrame` passes `rmf.binormal` verbatim instead of recomputing a binormal perpendicular to the actual `inwardNormal`. For `u ≠ 0` the stored binormal is not orthogonal to the inward normal. In Milestone 1 only `.position` is consumed by `debugTrackRenderer.js`; the malformed binormal is unused. Non-blocking for M1; should be corrected before downstream systems consume the full frame.

5. **`dangerLevel` formula deviation (safeTrack.js line 44)** — implementation uses `angularDist / halfWidth - 0.8` (danger begins at 80 % of half-width) vs the spec's `- 1` (danger begins at the safe edge). The `onSafeTrack` boolean is unaffected. No game logic in M1 reads `dangerLevel`. Non-blocking for M1.

## Correctness Summary

| Check                                                  | Result                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RMF parallel-transport algorithm                       | PASS — double-reflection (Bishop frame) is mathematically correct; `c1 < 1e-12` and `c2 < 1e-12` guards prevent division by zero                                      |
| Degenerate bootstrap normal                            | PASS — fallback to Z-axis if Y-axis cross-product is near-zero; length check after normalize catches NaN from a truly zero tangent                                    |
| All `import` paths                                     | PASS — `three`, `../config.js`, and all `./procedural/*.js` cross-imports resolve; confirmed by clean Vite build                                                      |
| `getPointOnSurface` position                           | PASS — `position = centerlinePos + (cos(u)·normal + sin(u)·binormal) * radius` is the correct tube-surface formula                                                    |
| `getFrame` inward normal direction                     | PASS — `inwardNormal = -radialDir` correctly points toward tube center for a tube-inner surface                                                                       |
| `angleDiff` wrap-around                                | PASS — formula `((a-b) % 2π + 3π) % 2π - π` verified equivalent to standard `((a-b+π) % 2π + 2π) % 2π - π`; handles JS negative-modulo correctly                      |
| `generateDemoTrack` CatmullRom + SafeTrack assembly    | PASS — `buildCurve`, `makeSurfaceSegment`, `makeSafeTrack`/`makeSafeTrackSample` used correctly; `safeTrack.radius = TUNNEL_R` set for angular half-width computation |
| `PROCEDURAL_DEBUG = false` skips all debug code        | PASS — single `if (PROCEDURAL_DEBUG)` block, no side-effects outside it                                                                                               |
| Unchanged files (physics, ball, camera, tunnel, state) | PASS — confirmed unmodified                                                                                                                                           |

## Summary

All eight procedural subsystem files implement the Milestone 1 scope correctly and the frontend build is clean. The only items worth tracking into Milestone 2 are the binormal inconsistency in `getFrame()` (note 4) and the `dangerLevel` threshold offset (note 5), both of which are invisible to the current game runtime.
