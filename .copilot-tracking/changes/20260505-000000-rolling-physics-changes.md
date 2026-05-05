# Changes: Ball Rolling Physics

## Metadata

- **Feature**: rolling-physics
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none (fast mode)
- **Details**: none
- **Review**: none

## Summary

Replaced the lateral steering model with a real rolling physics model. Ball spin (`ballOmega`) is driven by player input torque and couples to tunnel position through rolling friction, with spin transfer on bounce impacts.

## Tasks

- [x] Add `BALL_R` constant to config.js
- [x] Replace CFG object with rolling physics params
- [x] Add `ballOmega` state field
- [x] Import `BALL_R`, `TUNNEL_R` in physics.js
- [x] Reset `ballOmega` in `respawnAfterCrash`
- [x] Replace lateral physics block with rolling model
- [x] Add spin transfer on bounce impact

## Files Modified

| File                          | Action   | Why                                                  |
| ----------------------------- | -------- | ---------------------------------------------------- |
| `tron-tunel-3/src/config.js`  | Modified | Added `BALL_R`; replaced CFG with rolling params     |
| `tron-tunel-3/src/state.js`   | Modified | Added `ballOmega` state field                        |
| `tron-tunel-3/src/physics.js` | Modified | Rolling physics, respawn reset, bounce spin transfer |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS (✓ built in 673ms)
- Tests: SKIPPED

## Notes

- Old params (`steerAcceleration`, `groundedFriction`, `airFriction`, `inertiaDecay`) removed from CFG; `BALL_PHYS.inertiaDecay` intentionally preserved for `playerSurface.js`.
- `TUNNEL_R` was already used in `ball.js` / `camera.js` — no changes needed there.
