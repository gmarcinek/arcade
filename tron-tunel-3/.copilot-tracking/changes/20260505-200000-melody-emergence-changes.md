# Changes: Melody-Driven Tunnel Emergence Effect

## Metadata

- **Feature**: melody-emergence
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none (fast mode)
- **Details**: none
- **Review**: none

## Summary

Tunnel rings far ahead of the player now emerge from a glowing melody waveform wire. The mesh collapses to a thin oscillating wire (driven by mid/melody audio) beyond `emergeDist` meters, solidifies smoothly into the full tunnel shape closer in, and shakes with bass impacts near the player. A `TUNNEL_FX_CONFIG` export lets callers tweak all effect strengths and colors at runtime.

## Tasks

- [x] Add `AudioMetadataBus` import
- [x] Export `TUNNEL_FX_CONFIG` after constants block
- [x] Replace `makeMaterial()` with new uniforms + shader (emergence, waveform glow, cfg-driven colors)
- [x] Replace `update()` body with emergence factor, melody waveform & bass shake vertex displacement, and config→uniform sync

## Files Modified

| File                                          | Action   | Why                 |
| --------------------------------------------- | -------- | ------------------- |
| `tron-tunel-3/src/procedural/infiniteMesh.js` | Modified | All 4 changes above |

## Verification

- Frontend build (`npm`): PASS (✓ built in 668ms)
- Backend build: SKIPPED (not applicable)
- Tests: SKIPPED

## Notes

- Inner loop angular variable renamed `u` → `u_ang` to avoid shadowing the uniform-reference `const u = this._mat.uniforms` at the top of `update()`.
- `emerge` factor in the fragment shader uses `smoothstep(0, uEmergeDist, aheadDist)` so it matches the JS-side cubic smoothstep applied to vertex positions.
