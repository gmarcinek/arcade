# Changes: Merge proceduralConfig into config

## Metadata

- **Feature**: merge-proceduralConfig
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Merged `proceduralConfig.js` into `config.js` as a new `PROC_CFG` export. Removed dead fields (`SAFE_TRACK_WIDTH`, `ANGULAR_GRAVITY`, `CFG.minSpeed`, `BALL_PHYS.steerLagK`). Updated all 5 consumer imports and deleted the old file.

## Tasks

- [x] Replace config.js with merged content (dead fields removed, PROC_CFG appended)
- [x] Update import in crossSection.js
- [x] Update import in playerSurface.js (merged into existing config import)
- [x] Update import in camera.js
- [x] Update import in trackChunkManager.js
- [x] Update import in playerSurfaceBasis.js
- [x] Delete proceduralConfig.js
- [x] Run build verification

## Files Modified

| File                                   | Action   | Why                                                                                                |
| -------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `src/config.js`                        | Modified | Added PROC_CFG block; removed dead fields (minSpeed, steerLagK); cleaned up Polish inline comments |
| `src/procedural/crossSection.js`       | Modified | Import path updated                                                                                |
| `src/procedural/playerSurface.js`      | Modified | Merged PROC_CFG into existing config import; removed redundant import line                         |
| `src/camera.js`                        | Modified | Import path updated                                                                                |
| `src/procedural/trackChunkManager.js`  | Modified | Import path updated                                                                                |
| `src/procedural/playerSurfaceBasis.js` | Modified | Import path updated                                                                                |
| `src/procedural/proceduralConfig.js`   | Deleted  | Merged into config.js                                                                              |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS — 29 modules, 541 kB, 0 errors
- Tests: SKIPPED

## Notes

- `LOOKAHEAD_SEGMENTS` changed from 4 → 2 as specified in the task.
