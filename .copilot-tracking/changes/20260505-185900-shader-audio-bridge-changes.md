# Changes: Wire ShaderAudioBridge to InfiniteMesh

## Metadata

- **Feature**: shader-audio-bridge-infinite-mesh
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: `.copilot-tracking/plans/20260505-185900-shader-audio-bridge-fast-plan.md`
- **Details**: none
- **Review**: none

## Summary

Added 9 audio uniforms (`uBass`, `uMid`, `uTreble`, `uBassImpact`, `uMidWave`, `uOnsetPulse`, `uBeatPulse`, `uMusicEnergy`, `uChromaTint`) to the `InfiniteMesh` shader material and wired them into the fragment shader. Exposed the material via a `get material()` getter and registered it with `audioSystem.bridge` in `main.js`.

## Tasks

- [x] A: Add audio uniforms to `makeMaterial()` uniforms object
- [x] B: Add GLSL uniform declarations to fragment shader
- [x] C: `lavaPulse` driven by `uBass`
- [x] D: Lava colour tinted by `uChromaTint` / `uMusicEnergy`
- [x] E: Contact glow boosted by `uOnsetPulse`
- [x] F: Angular grid brightened by `uBeatPulse`
- [x] G: Ring seams brightened by `uBeatPulse`
- [x] H: Running strips brightened by `uMidWave`
- [x] I: Amber tiles brightened by `uBassImpact`
- [x] J: Final brightness scale + clamp raised by `uMusicEnergy`
- [x] K: `get material()` getter added to `InfiniteMesh` class
- [x] main.js: `audioSystem.bridge.register(infiniteMeshObj.material)` added after `InfiniteMesh` construction

## Files Modified

| File                                          | Action   | Why                                                           |
| --------------------------------------------- | -------- | ------------------------------------------------------------- |
| `tron-tunel-3/src/procedural/infiniteMesh.js` | Modified | Add audio uniforms, GLSL declarations, shader effects, getter |
| `tron-tunel-3/src/main.js`                    | Modified | Register InfiniteMesh material with ShaderAudioBridge         |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PASS — `✓ built in 664ms`
- Tests: SKIPPED
