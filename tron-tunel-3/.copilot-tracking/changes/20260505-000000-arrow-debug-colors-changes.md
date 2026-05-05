# Changes: Arrow Debug Colors & Idle Steering Indicator

## Metadata

- **Feature**: arrow-debug-colors
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Swapped inertia (green) and steering input (blue) arrow colors, and updated the steering arrow to remain visible when idle by showing thetaVelocity direction at a capped length.

## Tasks

- [x] Swap arrowInertia (blue→green) and arrowInput (green→blue) colors
- [x] Steering arrow: always visible when showForces active, shows thetaVelocity direction at capped length when no input

## Files Modified

| File          | Action   | Why                                            |
| ------------- | -------- | ---------------------------------------------- |
| `src/ball.js` | Modified | Swap arrow colors; update steering arrow logic |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): SKIPPED (no build requested)
- Tests: SKIPPED

## Notes

- Steering arrow now hidden only when `showForces` is off OR thetaVelocity ≤ 0.05 and no input active
- `steerLen` caps idle display at 1.5 world units to avoid visual noise at high lateral speeds
