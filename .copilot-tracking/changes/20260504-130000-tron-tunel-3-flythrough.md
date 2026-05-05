# Changes: Tron Tunel 3 — Flythrough Debug Camera

## Metadata

- **Feature**: tron-tunel-3-flythrough
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: `.copilot-tracking/plans/20260504-130000-tron-tunel-3-flythrough-fast-plan.md`
- **Details**: none
- **Review**: none

## Summary

Added a flythrough debug camera mode to tron-tunel-3. The camera automatically flies through the procedural tunnel along the safe track with no player controls. Press ESC to exit.

## Tasks

- [x] Extract `demoTrack` to outer scope (was inside `if (PROCEDURAL_DEBUG)`)
- [x] Add flythrough state variables (`flythroughActive`, `flythroughS`, `FLYTHROUGH_SPEED`)
- [x] Add `getSafeTrackUAt`, `updateFlythroughCamera`, `startFlythrough`, `stopFlythrough` helpers
- [x] Add flythrough early-return block in `loop()`
- [x] Add `flythrough-btn` to `index.html`
- [x] Wire button click and ESC key handler

## Files Modified

| File          | Action   | Why                                                         |
| ------------- | -------- | ----------------------------------------------------------- |
| `index.html`  | Modified | Added `#flythrough-btn` in `#overlay` after `mode-btn`      |
| `src/main.js` | Modified | Flythrough state, helpers, loop early-return, button wiring |

## Verification

- Backend build (`mvn`): SKIPPED (frontend only project)
- Frontend build (`npm`): PASS — `✓ built in 1.20s`, 23 modules transformed, no errors
- Tests: SKIPPED

## Notes

- `demoTrack` is now always generated (not gated by `PROCEDURAL_DEBUG`) so flythrough works regardless of debug flag
- `stopFlythrough` restores `debugRenderer` visibility to `PROCEDURAL_DEBUG` value (true in current config)
- Camera uses `frame.normal` as `up` and looks 20 units forward along `frame.forward`
