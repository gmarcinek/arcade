# Changes: Death Blast Visual

## Metadata

- **Feature**: death-blast-visual
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: `.copilot-tracking/plans/20260507-150500-death-blast-fast-plan.md`
- **Details**: none
- **Review**: none

## Summary

Implemented a visual death blast for tron-tunel-3 where the ball remains visible during respawn, moves forward in the explosion direction, and scales up to 10x over 2 seconds before restart resets state.

## Tasks

- [x] Add constants in config.
- [x] Add death/respawn blast runtime state in main loop.
- [x] Add blast motion+scale logic in ball visuals.
- [x] Run frontend build verification.

## Files Modified

| File                         | Action   | Why                                                              |
| ---------------------------- | -------- | ---------------------------------------------------------------- |
| `tron-tunel-3/src/config.js` | Modified | Added death-blast duration and max scale constants               |
| `tron-tunel-3/src/main.js`   | Modified | Added death-blast init/reset runtime state in death/respawn flow |
| `tron-tunel-3/src/ball.js`   | Modified | Applied death-blast forward movement and eased growth multiplier |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS
- Tests: SKIPPED

## Notes

- Keeps existing explosion burst and debris emission behavior.
- Build command: `npm.cmd run build` (vite production build passed)
