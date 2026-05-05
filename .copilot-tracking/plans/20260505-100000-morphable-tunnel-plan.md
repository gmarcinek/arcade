# Plan: Morphable Tunnel Cross-Sections

## Metadata

- **Feature**: morphable-tunnel
- **Status**: COMPLETE
- **Research**: none
- **Details**: [.copilot-tracking/details/20260505-100000-morphable-tunnel-details.md](.copilot-tracking/details/20260505-100000-morphable-tunnel-details.md)

## Goal

Tunnel cross-section morphs between named shapes (circle, halfpipe, triangle, pentagon, flat)
over arc-length using smoothstep blending, driven by a configurable schedule in `PROC_CFG`.
Two known bugs are fixed as part of this work.

---

## MUST-HAVE

- [ ] **Task 1 — Fix timer bug (main.js)**
  - Files: `tron-tunel-3/src/main.js` ~line 195
  - Wrap `state.timeLeft` block with `if (!PROCEDURAL_PLAYER)`
  - Verify: procedural mode no longer ends game after 60 s

- [ ] **Task 2 — Verify boost visual (playerSurface.js)**
  - Files: `tron-tunel-3/src/procedural/playerSurface.js` line 52
  - `state.speed = state.sVelocity` is already set; confirm `ball.js` reads `state.speed` for ribbon.
    No code change needed if confirmed. Add the assignment if missing.
  - Verify: boost ribbon activates while `boostHeld = true`

- [ ] **Task 3 — Create `crossSection.js`**
  - Files: `tron-tunel-3/src/procedural/crossSection.js` (new file)
  - Implement `shapePoint()`, `polygonPoint()`, `createCrossSection()` factory
  - Exports: `{ getPoint(u, s, R), getFloorU(s, frame, R) }`
  - Verify: `getPoint` returns `{x,y}` for all five shape names at representative u/s values

- [ ] **Task 4 — Add shape config to `proceduralConfig.js`**
  - Files: `tron-tunel-3/src/procedural/proceduralConfig.js` lines 1-24
  - Append `SHAPE_SEQUENCE`, `SHAPE_INTERVAL`, `TRANSITION_LEN` to `PROC_CFG`
  - Verify: no import errors; values accessible from `crossSection.js`

- [ ] **Task 5 — Wire cross-section into `infiniteMesh.js`**
  - Files: `tron-tunel-3/src/procedural/infiniteMesh.js`
  - Constructor: `constructor(scene, spline, crossSection)` — store `this._cs`
  - `update()`: replace `cosU/sinU * TUNNEL_R` vertex math with `this._cs.getPoint(u, ringS, TUNNEL_R)`
  - Normal recalculation: use `cx/len, cy/len` instead of `cosU, sinU`
  - Verify: tunnel renders without gaps; normals point inward for all shapes

- [ ] **Task 6 — Update `playerSurface.js` to use cross-section floor**
  - Files: `tron-tunel-3/src/procedural/playerSurface.js`
  - `initPlayerSurface(spline, crossSection)` — store `_crossSection`
  - Init: replace `spline.getFloorU(0)` with `_crossSection.getFloorU(0, spline.getFrameAt(0), TUNNEL_R)`
  - `updatePlayerSurface()`: replace `_spline.getFloorU(state.s)` with frame-based call
  - Verify: gravity pulls player toward the lowest point of non-circular shapes

- [ ] **Task 7 — Update `playerSurfaceBasis.js` to use cross-section shape**
  - Files: `tron-tunel-3/src/procedural/playerSurfaceBasis.js`
  - `initPlayerSurfaceBasis(spline, crossSection)` — store `_crossSection`
  - `getPlayerFrame()`: derive `radialDir` and `position` from `_crossSection.getPoint(state.u, state.s, 1.0)`
  - Verify: ball sits on surface, not floating in mid-air on halfpipe/flat shapes

- [ ] **Task 8 — Wire everything in `main.js`**
  - Files: `tron-tunel-3/src/main.js`
  - Import `createCrossSection` from `./procedural/crossSection.js`
  - After `infiniteSpline = createInfiniteSpline(42)` block: `const crossSection = createCrossSection()`
  - Update `new InfiniteMesh(scene, infiniteSpline, crossSection)`
  - Update `initPlayerSurface(infiniteSpline, crossSection)`
  - Update `initPlayerSurfaceBasis(infiniteSpline, crossSection)`
  - Verify: no import errors, Vite dev server starts cleanly

---

## NICE-TO-HAVE

- [ ] **Task 9 — Tune shape schedule constants**
  - Files: `tron-tunel-3/src/procedural/proceduralConfig.js`
  - Adjust `SHAPE_INTERVAL` / `TRANSITION_LEN` after play-testing
  - Verify: transitions feel smooth and not jarring at current speed

---

## Dependencies

- Tasks 3 and 4 must be done before Tasks 5, 6, 7, 8
- Tasks 5, 6, 7 are independent of each other once 3+4 are done
- Task 8 must be done after 5, 6, 7

## Open Questions

- none

## Effort

Medium
