# Changes: Parallax Depth Layering — Tunnel Shader

## Metadata

- **Feature**: parallax-depth-layers
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Added 3 parallax depth planes (`fragS_D`, `fragS_M`, `fragS_N`) to the tunnel fragment shader. Each plane drifts at a different speed/direction along arc-length, with mid/near planes also driven by audio deltas (`bassImpact`, `midWave`). All shader layer references updated; surface-anchored elements (grid, chevrons, contact glow) unchanged.

## Tasks

- [x] Add `parallax` config block to `TUNNEL_FX_CONFIG`
- [x] Add 8 parallax uniforms to `makeMaterial()`
- [x] Add 8 uniform declarations in fragment shader
- [x] Compute `fragS_D / fragS_M / fragS_N` in `main()`
- [x] Update bg flares → `fragS_D`
- [x] Update lava lv1 → `fragS_M`, lv2 → `fragS_D`, lavaPulse → `fragS_M`
- [x] Update longitudinal lanes → `fragS_M`
- [x] Update twisted ribbons → `fragS_N`
- [x] Update running-light strips → `fragS_N`
- [x] Update orange dash tiles → `fragS_N`
- [x] Update blue secondary tiles + tinySpark → `fragS_D`
- [x] Update front palette ribbons + dots → `fragS_N`
- [x] Sync parallax uniforms in `_syncConfigUniforms()`

## Files Modified

| File                                          | Action   | Why                  |
| --------------------------------------------- | -------- | -------------------- |
| `tron-tunel-3/src/procedural/infiniteMesh.js` | Modified | All parallax changes |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS — `✓ built in 691ms`
- Tests: SKIPPED

## Depth Plane Summary

| Plane   | fragS var | Drift                        | Audio driver  | Layers                                         |
| ------- | --------- | ---------------------------- | ------------- | ---------------------------------------------- |
| Deep    | fragS_D   | -5 m/s (toward player)       | none          | bg flares, lv2, blue tiles                     |
| Mid     | fragS_M   | +3 m/s (away from player)    | bassImpact +8 | lv1, lavaPulse, long lanes                     |
| Near    | fragS_N   | -12 m/s (toward player fast) | midWave -15   | twist, strips, orange tiles, front palette     |
| Surface | fragS     | anchor                       | none          | grid/rings, chevrons, floor edge, contact glow |
