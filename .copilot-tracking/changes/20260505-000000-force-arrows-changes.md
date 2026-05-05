# Changes: Force Vector Debug Arrows

## Metadata

- **Feature**: force-arrows
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: [20260505-000000-force-arrows-fast-plan.md](../plans/20260505-000000-force-arrows-fast-plan.md)
- **Details**: none
- **Review**: none

## Summary

Added four `THREE.ArrowHelper` debug arrows to the tron-tunel-3 ball, showing lateral inertia (blue), radial velocity (red), steering input (green), and resultant (yellow). Toggled on/off with the **F** key.

## Tasks

- [x] state.js: add `showForces` flag
- [x] input.js: add KeyF toggle in keydown handler
- [x] ball.js: add `makeArrow`/`setArrow` helpers before `createBall`
- [x] ball.js: create 4 arrows in `createBall`, add to return object
- [x] ball.js: update arrows each frame at end of `updateCarVisuals`
- [x] Build verification

## Files Modified

| File                        | Action   | Why                                       |
| --------------------------- | -------- | ----------------------------------------- |
| `tron-tunel-3/src/state.js` | Modified | Add `showForces` boolean flag             |
| `tron-tunel-3/src/input.js` | Modified | KeyF toggles `state.showForces`           |
| `tron-tunel-3/src/ball.js`  | Modified | Arrow helpers, creation, per-frame update |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS — `✓ built in 655ms`, no errors
- Tests: SKIPPED

## Notes

- Arrows are added to `scene` (world space), not to `carGroup`, so positions are set each frame to `carGroup.position`
- `setArrow` hides arrows whose magnitude is ≤ 0.05 to avoid zero-length direction issues with `ArrowHelper`
