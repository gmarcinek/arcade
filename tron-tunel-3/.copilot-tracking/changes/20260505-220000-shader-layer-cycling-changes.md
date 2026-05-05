# Changes: Shader Layer Cycling

## Metadata

- **Feature**: shader-layer-cycling
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Added per-layer slow opacity cycling (8 sec period, spread via phase offsets) and a global bright/dark oscillation (60 sec full cycle, 0.18–1.0 range) to the tunnel shader in `tron-tunel-3`.

## Tasks

- [x] Add cycle timing config to TUNNEL_FX_CONFIG (layerCyclePeriod, brightCyclePeriod, brightMin, brightMax)
- [x] Add phase offsets to all opacity entries; lower min values to 0 (except contact/floorEdge)
- [x] Add uGlobalBright uniform in makeMaterial() JS uniforms
- [x] Add uGlobalBright GLSL uniform declaration in fragment shader
- [x] Apply uGlobalBright multiplier before col clamp in GLSL main()
- [x] Update \_evalOpacity() to apply per-layer gate (contact/floorEdge bypass)
- [x] Compute and set uGlobalBright at end of \_syncConfigUniforms()

## Files Modified

| File                             | Action   | Why                          |
| -------------------------------- | -------- | ---------------------------- |
| `src/procedural/infiniteMesh.js` | Modified | All 6 shader cycling changes |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS
- Tests: SKIPPED
