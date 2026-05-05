# Changes: Audio-Reactive Shader System

## Metadata

- **Feature**: audio-reactive-shader
- **Mode**: STANDARD
- **Status**: IN_PROGRESS
- **Plan**: [.copilot-tracking/plans/20260505-130000-audio-reactive-shader-plan.md](../plans/20260505-130000-audio-reactive-shader-plan.md)
- **Details**: [.copilot-tracking/details/20260505-130000-audio-reactive-shader-details.md](../details/20260505-130000-audio-reactive-shader-details.md)
- **Review**: none

## Summary

Full audio-reactive pipeline for tron-tunel-3: screen capture via getDisplayMedia, FFT/beat/onset/chroma analysis, AudioMetadataBus singleton, ShaderAudioBridge pushing 14 uniforms per frame including a 256×1 RGBA history DataTexture, reactive tunnel GLSL effects, ball glow/scale modulation, and Spotify-URL UI panel.

## Tasks

- [ ] Task 1 — Audio module scaffold (5 new files)
- [ ] Task 2 — Shader uniform declarations (shaders.js + tunnel.js)
- [ ] Task 3 — GLSL audio effects (shaders.js)
- [ ] Task 4 — Ball audio modulation (ball.js)
- [ ] Task 5 — main.js + index.html wiring
- [ ] Build verification

## Files Modified

| File                                          | Action   | Why                                                       |
| --------------------------------------------- | -------- | --------------------------------------------------------- |
| `tron-tunel-3/src/audio/AudioMetadataBus.js`  | Created  | Singleton bus for current-frame audio data                |
| `tron-tunel-3/src/audio/AudioCapture.js`      | Created  | getDisplayMedia capture + AudioContext lifecycle          |
| `tron-tunel-3/src/audio/AudioAnalyzer.js`     | Created  | Full FFT/beat/onset/chroma analysis ported from prototype |
| `tron-tunel-3/src/audio/ShaderAudioBridge.js` | Created  | DataTexture history + uniform push per frame              |
| `tron-tunel-3/src/audio/index.js`             | Created  | createAudioSystem() factory                               |
| `tron-tunel-3/src/shaders.js`                 | Modified | Audio uniforms + vertex displacement + GLSL FX            |
| `tron-tunel-3/src/tunnel.js`                  | Modified | Add 14 audio uniforms to tunnelMat                        |
| `tron-tunel-3/src/ball.js`                    | Modified | AudioMetadataBus import + emissive/scale modulation       |
| `tron-tunel-3/src/main.js`                    | Modified | createAudioSystem wiring + UI button handlers             |
| `tron-tunel-3/index.html`                     | Modified | Spotify URL input + audio capture button + status panel   |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): PENDING
- Tests: SKIPPED

## Notes

- historyTex uses 256×1 RGBA, wrapS=RepeatWrapping, LinearFilter for smooth boundary scroll
- ShaderAudioBridge.register() immediately assigns historyTex to uHistory to avoid null sampler2D warning
- Ball scale modulation only overrides when audio is active; squash/stretch preserved when inactive
- uHistMps = 12.0 (metres per history sample) — different from prototype's 1.5
