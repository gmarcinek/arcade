# Plan: Audio-Reactive Shader System

## Metadata

- **Feature**: audio-reactive-shader
- **Status**: COMPLETE
- **Research**: [.copilot-tracking/research/20260505-120000-audio-reactive-shader-research.md](../research/20260505-120000-audio-reactive-shader-research.md)
- **Details**: [.copilot-tracking/details/20260505-130000-audio-reactive-shader-details.md](../details/20260505-130000-audio-reactive-shader-details.md)

## Goal

Add a full audio-reactive pipeline to tron-tunel-3: screen audio capture via `getDisplayMedia`, FFT/beat analysis, `AudioMetadataBus` singleton, `ShaderAudioBridge` pushing 13 uniforms per frame, reactive tunnel shader GLSL effects, and ball glow/scale modulation — all with a safe no-audio fallback (game identical when audio is off).

## MUST-HAVE

- [ ] **Task 1 — Audio module scaffold** (5 new files, no game wiring yet)
  - Files: `tron-tunel-3/src/audio/AudioMetadataBus.js`, `AudioCapture.js`, `AudioAnalyzer.js`, `ShaderAudioBridge.js`, `index.js`
  - Verify: `npm run build` passes; `npm run dev` loads game unchanged

- [ ] **Task 2 — Shader uniform declarations** (shaders.js + tunnel.js atomic pair)
  - Files: `tron-tunel-3/src/shaders.js`, `tron-tunel-3/src/tunnel.js`
  - Add all 13 audio uniform declarations to `tunnelVertexShader` and `tunnelFragmentShader`; add matching `{ value: 0 }` / `{ value: null }` entries to `tunnelMat.uniforms`; add `uHistory` DataTexture placeholder (`null` initially)
  - Verify: `npm run dev` → game loads, no THREE.js `uniform not found` console errors; visuals unchanged

- [ ] **Task 3 — GLSL audio effects** (shaders.js only)
  - Files: `tron-tunel-3/src/shaders.js`
  - Vertex: inject audio uniforms, compute `bassStretch`/`longWave`/`kickRipple`/`warp`, displace `p.xy`
  - Fragment: rewrite `arcHalfAtZ` with `historyAt()` + bass width; replace `lavaPulse` hardcode; add chroma-tinted lava colours; ring beat flash; strip bass boost; tile onset boost; chevron treble speed; boundary bass boost
  - Verify: game runs with audio off (uniforms = 0) → visuals identical to before Task 2; no GLSL compile errors in browser console

- [ ] **Task 4 — Ball audio modulation** (ball.js)
  - Files: `tron-tunel-3/src/ball.js`
  - Import `AudioMetadataBus`; in `updateCarVisuals()` read `AudioMetadataBus.current`; if non-null: set `ballMat.emissive`, `ballMat.emissiveIntensity`, `ball.scale`, `carLight.intensity`, `carLight.distance`
  - Verify: ball renders normally with no audio; `AudioMetadataBus.current = { beatPulse:1 }` in devtools console causes visible glow/scale pulse

- [ ] **Task 5 — main.js + index.html wiring**
  - Files: `tron-tunel-3/src/main.js`, `tron-tunel-3/index.html`
  - `main.js`: import `createAudioSystem`; instantiate at top-level; call `audioSystem.tick(dt, elapsedTime)` **before** uniform writes in **both** the flythrough branch and the main `loop()` path; wire `#audio-btn` click → `audioSystem.startCapture()`; wire `#spotify-input` → `window.open(url)`
  - `index.html`: add Spotify URL `<input>` + open-link button + `#audio-btn` + `#audio-status`/`#audio-bpm` panel inside `#overlay`
  - Verify: full manual flow — paste Spotify URL, open tab, click AUDIO REACTIVE, share Spotify tab + audio in browser dialog, BPM readout appears, lava pulses with bass, boundary breathes, ring seams flash on beats

## NICE-TO-HAVE

- [ ] **Task 6 — config defaults for audio sensitivity**
  - Files: `tron-tunel-3/src/config.js`
  - Add `AUDIO_CFG = { bassGain: 1.0, midGain: 1.0, onsetThresholdMult: 1.35 }` — lets future tuning without touching analysis code

## Dependencies

- Tasks 2 and 3 must be done together or in immediate sequence (uniform names must match between GLSL and JS)
- Task 5 depends on Tasks 1–4 being complete (imports `createAudioSystem`, reads bus, uniforms exist)

## Open Questions

- none — research resolves all decisions

## Effort

Medium
