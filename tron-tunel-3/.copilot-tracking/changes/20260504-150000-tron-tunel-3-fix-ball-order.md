# Changes: Fix ball position update order in tron-tunel-3

## Metadata

- **Feature**: tron-tunel-3-fix-ball-order
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Swapped `updateBallPositionFromFrame` to run after `updateCarVisuals` in the `tick()` function so the ball position is set using the latest visual state each frame.

## Tasks

- [x] Swap call order in `tick()` inside `if (PROCEDURAL_PLAYER)` branch

## Files Modified

| File          | Action   | Why                                                               |
| ------------- | -------- | ----------------------------------------------------------------- |
| `src/main.js` | Modified | Reordered `updateCarVisuals` before `updateBallPositionFromFrame` |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): SKIPPED
- Tests: SKIPPED

## Notes

Single-line reorder, no other changes made.
