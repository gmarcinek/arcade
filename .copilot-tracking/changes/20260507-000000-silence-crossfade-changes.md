# Changes: Silence Fallback — Grid + Fractal Cross-Fade

## Metadata

- **Feature**: silence-crossfade
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Replaced the silence-fallback block in the tunnel fragment shader so both the angular grid and Julia-set fractal render simultaneously, blended by a slow ~80 s sinusoidal cross-fade with a floor of 0.25 so neither layer ever fully disappears.

## Tasks

- [x] Replace old fractal-only block with dual-layer (grid + fractal) block
- [x] Add `sgPhase`, `wGrid`, `wFractal` cross-fade weights (floor 0.25, anti-phase sine)
- [x] Layer A: angular grid + ring seams (uses existing `softLine`, `angle01`, `fragS`)
- [x] Layer B: Julia-set fractal unchanged, blended via `wFractal * 0.72`
- [x] Faint edge glow retained

## Files Modified

| File                                          | Action   | Why                                 |
| --------------------------------------------- | -------- | ----------------------------------- |
| `tron-tunel-3/src/procedural/mesh.shaders.js` | Modified | Replace silence-fallback GLSL block |

## Verification

- Backend build (`mvn`): SKIPPED (no Java changes)
- Frontend build (`npm`): SKIPPED (pure GLSL string in JS template literal, no build step required)
- Tests: SKIPPED

## Notes

- `PI` used in `sin(sgPhase + PI)` is already defined via `#define PI 3.14159265359` at the top of the fragment shader.
- Grid layer uses `+=` (additive blend) while fractal layer uses `mix()` to avoid double-darkening.
