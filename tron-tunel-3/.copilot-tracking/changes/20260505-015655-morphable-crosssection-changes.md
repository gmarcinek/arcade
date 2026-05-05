# Changes: Morphable Cross-Sections + Timer Fix

## Metadata

- **Feature**: morphable-crosssection
- **Mode**: STANDARD
- **Status**: COMPLETE
- **Plan**: none (plan file not present, request was self-contained)
- **Details**: none
- **Review**: none

## Summary

Added a `crossSection.js` module that morphs the tunnel cross-section through a configurable shape sequence (circle → halfpipe → circle → triangle → circle → pentagon) using smoothstep transitions. Fixed the game timer so it only counts down in legacy (non-procedural) mode. Updated `InfiniteMesh`, `playerSurface`, and `playerSurfaceBasis` to use shape-aware geometry and floor detection, with full fallback to circle when `crossSection` is null.

## Tasks

- [x] TASK 1 — Fix timer: guard `timeLeft` countdown with `!PROCEDURAL_PLAYER`
- [x] TASK 2 — Verify `state.speed = state.sVelocity` (already present, no change needed)
- [x] TASK 3 — Create `src/procedural/crossSection.js`
- [x] TASK 4 — Add `SHAPE_SEQUENCE`, `SHAPE_INTERVAL`, `TRANSITION_LEN` to `proceduralConfig.js`
- [x] TASK 5 — Update `InfiniteMesh` constructor + vertex loop to use cross-section
- [x] TASK 6 — Update `playerSurface.js` to accept and use `crossSection` for floor detection
- [x] TASK 7 — Update `playerSurfaceBasis.js` to accept and use `crossSection` for ball position
- [x] TASK 8 — Wire `createCrossSection` into `main.js` init and `startGame`

## Files Modified

| File                                   | Action   | Why                                                  |
| -------------------------------------- | -------- | ---------------------------------------------------- |
| `src/procedural/crossSection.js`       | Created  | New morphable cross-section module                   |
| `src/procedural/proceduralConfig.js`   | Modified | Added SHAPE_SEQUENCE, SHAPE_INTERVAL, TRANSITION_LEN |
| `src/procedural/infiniteMesh.js`       | Modified | Constructor + vertex loop use crossSection           |
| `src/procedural/playerSurface.js`      | Modified | Signature + shape-aware floor detection              |
| `src/procedural/playerSurfaceBasis.js` | Modified | Signature + shape-aware ball position                |
| `src/main.js`                          | Modified | Import, init, startGame wiring + timer guard         |

## Verification

- Backend build (`mvn`): SKIPPED (frontend-only project)
- Frontend build (`npm`): PASS (30 modules, 532.92 kB, 0 errors)
- Tests: SKIPPED

## Notes

- Task 2 was already satisfied: `state.speed = state.sVelocity` existed in `playerSurface.js` after the speed block.
- Legacy mode (`PROCEDURAL_PLAYER = false`) is unaffected: `crossSection` is null so all three modules fall back to circle math.
- `getFloorU` on `crossSection` searches 64 sample points per call; acceptable at 60 fps since it runs once per frame.
