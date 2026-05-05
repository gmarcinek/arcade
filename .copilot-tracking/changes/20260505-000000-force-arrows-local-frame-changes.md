# Changes: Force Debug Arrows — Ball Local Reference Frame

## Metadata

- **Feature**: force-arrows-local-frame
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Fixed the force debug arrow visualization in `ball.js` to use the ball's actual local reference frame. In procedural tunnel mode the cylindrical `basis.right` / `basis.surfaceOut` vectors are wrong; the arrows now pick `proceduralFrame.right` / `proceduralFrame.normal` when in procedural mode and fall back to the classic `basis.*` vectors otherwise.

## Tasks

- [x] Replace hardcoded `basis.right` / `basis.surfaceOut` with `ballRight` / `ballOut` locals
- [x] `ballRight` = `proceduralFrame.right` (procedural) or `basis.right` (classic)
- [x] `ballOut` = `proceduralFrame.normal` (procedural) or `basis.surfaceOut` (classic)
- [x] Run build verification

## Files Modified

| File                       | Action   | Why                                            |
| -------------------------- | -------- | ---------------------------------------------- |
| `tron-tunel-3/src/ball.js` | Modified | Use correct local frame for force debug arrows |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS (`vite build` — 29 modules, 0 errors)
- Tests: SKIPPED

## Notes

`proceduralFrame` was already a parameter of `updateCarVisuals` (default `null`), so no signature changes were needed.
