# Changes: Gravity Debug Arrows

## Metadata

- **Feature**: grav-debug-arrows
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Added two new debug arrows to the force visualizer in `ball.js`: a white arrow showing world gravity direction (0,-g,0) and a magenta arrow showing the projection of world gravity onto the ball's lateral (ballRight) axis — the hidden sideways force that varies with the ball's theta position inside the tunnel.

## Tasks

- [x] Add `arrowGravWorld` (white) and `arrowGravLat` (magenta) arrow objects in `createBall`
- [x] Include both in the returned `ballObjects`
- [x] Compute and render both arrows in the force debug visualization block

## Files Modified

| File                       | Action   | Why                                        |
| -------------------------- | -------- | ------------------------------------------ |
| `tron-tunel-3/src/ball.js` | Modified | Added two new debug arrows + visualization |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS (✓ built in 660ms)
- Tests: SKIPPED

## Notes

- `arrowGravLat` is only visible when `gravLatLen > 0.05` to suppress noise near theta = 0° / 180°
- `gravLat` sign determines the arrow direction along `ballRight`; length is the magnitude of the projection
