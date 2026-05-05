# Plan: Infinite Tunnel Rewrite (Fast)

## Metadata

- **Feature**: infinite-tunnel
- **Mode**: FAST
- **Status**: IN_PROGRESS

## Goal

Replace chunk-based tunnel with one continuous procedural spline + one BufferGeometry mesh updated per frame. Remove game-over detection in procedural mode. Restore boost wake ribbon.

## Tasks

- [ ] Create `src/procedural/infiniteSpline.js`
- [ ] Create `src/procedural/infiniteMesh.js`
- [ ] Rewrite `src/procedural/playerSurface.js`
- [ ] Rewrite `src/procedural/playerSurfaceBasis.js`
- [ ] Modify `src/ball.js` — add `proceduralFrame` param to `updateCarVisuals`
- [ ] Modify `src/main.js` — wire new system, remove chunk-manager calls in proc path
- [ ] Run build verification and fix errors

## Verification

- Frontend build: `npm run build` in `tron-tunel-3`
