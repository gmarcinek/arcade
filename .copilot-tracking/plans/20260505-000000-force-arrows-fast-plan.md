# Plan: Force Vector Debug Arrows (Fast)

## Metadata

- **Feature**: force-arrows
- **Mode**: FAST
- **Status**: IN_PROGRESS

## Goal

Add debug ArrowHelper visualizations for lateral inertia, radial velocity, steering input, and resultant forces on the ball. Toggled with F key.

## Tasks

- [ ] state.js: add `showForces` flag
- [ ] input.js: add KeyF toggle in keydown handler
- [ ] ball.js: add `makeArrow`/`setArrow` helpers before `createBall`
- [ ] ball.js: create 4 arrows in `createBall`, add to return
- [ ] ball.js: update arrows each frame in `updateCarVisuals`
- [ ] Build verification

## Verification

- Frontend build: `npm run build` in tron-tunel-3
