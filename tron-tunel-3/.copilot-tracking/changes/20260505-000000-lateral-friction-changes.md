# Changes: Lateral Friction Differentiation

## Metadata

- **Feature**: lateral-friction
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Fixed lateral friction to use grounded vs air friction values from config instead of the unconditional `BALL_PHYS.inertiaDecay`. Ball now slides on wall when grounded (low friction) and decays inertia faster in air (high friction).

## Tasks

- [x] Replace `BALL_PHYS.inertiaDecay` with `state.grounded ? CFG.groundedFriction : CFG.airFriction` in physics.js
- [x] Run build verification

## Files Modified

| File             | Action   | Why                                                                                                   |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `src/physics.js` | Modified | Use `CFG.groundedFriction`/`CFG.airFriction` instead of `BALL_PHYS.inertiaDecay` for lateral friction |

## Verification

- Frontend build (`npm`): PASS
- Backend build: SKIPPED (frontend-only project)
- Tests: SKIPPED

## Notes

`BALL_PHYS.inertiaDecay` left in config as-is — may be used elsewhere.
