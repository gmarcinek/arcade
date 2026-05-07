# Changes: Silence Fallback — Julia-set Fractal

## Metadata

- **Feature**: silence-fractal
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none (fast mode)
- **Details**: none
- **Review**: none

## Summary

Replaced the static silence-fallback grid in the tunnel fragment shader with an animated Julia-set-like fractal attractor (echophons edit of glslsandbox #18752), adapted to tunnel UV space.

## Tasks

- [x] Replace grid block with fractal block in `mesh.shaders.js`

## Files Modified

| File                                          | Action   | Why                                        |
| --------------------------------------------- | -------- | ------------------------------------------ |
| `tron-tunel-3/src/procedural/mesh.shaders.js` | Modified | Swap silence fallback grid → Julia fractal |

## Verification

- Backend build (`mvn`): SKIPPED (frontend-only project)
- Frontend build (`npm`): SKIPPED (Vite hot-reload, no build step needed)
- Tests: SKIPPED

## Notes

- Fractal runs 25 iterations per fragment; well within typical mobile GPU budgets at tunnel resolution.
- `uElectricBlue` and `uStructureBlue` uniforms already present — no new uniforms required.
- Edge glow retained from original block unchanged.
