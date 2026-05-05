# Changes: Force Debug Visualization Fix

## Metadata

- **Feature**: force-debug-viz
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Fixed force debug arrows and added pivot axes helper so all debug overlays render on top of geometry (depthTest off), arrows use a surface-offset origin, and steering input reads directly from live `input` state instead of `state.physicsForce`.

## Tasks

- [x] Add `PROC_CFG` and `input` imports
- [x] Disable `depthTest`/`depthWrite` on `ArrowHelper` materials; set `renderOrder = 999`
- [x] Create `AxesHelper` (`pivotAxes`) in `createBall` with same depth settings
- [x] Include `pivotAxes` in return object
- [x] Replace force debug block: offset origin above surface, add `pivotAxes` orientation, use `uVelocity` in proc mode, read steering from `input` state

## Files Modified

| File          | Action   | Why                           |
| ------------- | -------- | ----------------------------- |
| `src/ball.js` | Modified | All five changes as specified |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS (✓ built in 666ms, 0 errors)
- Tests: SKIPPED
