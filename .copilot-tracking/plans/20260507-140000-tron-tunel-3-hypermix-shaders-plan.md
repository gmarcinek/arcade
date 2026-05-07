# Plan: Tron-Tunel-3 Hyper-Mix Shader Integration (3 Stages)

## Metadata

- **Feature**: tron-tunel-3-hypermix-shaders-3-stage
- **Status**: COMPLETE
- **Research**: [20260507-153000-tron-tunel-3-hypermix-shaders-research.md](.copilot-tracking/research/20260507-153000-tron-tunel-3-hypermix-shaders-research.md)
- **Details**: [20260507-140000-tron-tunel-3-hypermix-shaders-details.md](.copilot-tracking/details/20260507-140000-tron-tunel-3-hypermix-shaders-details.md)

## Goal

Integrate hyper-mix particle and postprocessing shaders into tron-tunel-3 in three sequential execution stages, culminating in a GPU-accelerated particle system with depth-aware shading and optional postprocessing effects. Maintain game logic integrity throughout and provide runtime toggles for performance fallback.

## MUST-HAVE

### Stage 1: Curl-Flow Particles Baseline

- [ ] **Initialize particle system module with stateless curl-flow GPU particles**
  - Files: `tron-tunel-3/src/particles/hmParticles.js`, `tron-tunel-3/src/particles/hmParticlesShaders.js`
  - Verify: Particles visible in both gameplay and flythrough modes; no frame rate regression; collision/death/respawn logic untouched

- [ ] **Wire particle system into main render loop**
  - Files: `tron-tunel-3/src/main.js`
  - Verify: Build succeeds; dev server runs; particles update per-frame in both tick branches

- [ ] **Expose runtime quality toggles and defaults**
  - Files: `tron-tunel-3/src/state.js`
  - Verify: Toggles `enableParticles`, `particlesQuality` (low/med/high), `particlesHalfResBuffer` control particle behavior at runtime

### Stage 2: Depth-Aware Particles with Fog & Shadow Ideas

- [ ] **Set up render-target pipeline (sceneColorRT + DepthTexture)**
  - Files: `tron-tunel-3/src/main.js`
  - Verify: Scene renders to target without visual regression; depth data flows to particle shaders; no flickering or banding

- [ ] **Adapt hyper-mix particle shading with depth reconstruction and fog**
  - Files: `tron-tunel-3/src/particles/hmParticleShadingStage2.js`, modify `tron-tunel-3/src/particles/hmParticles.js`
  - Verify: Particles correctly occluded by scene geometry; fog transitions smooth across camera FOV changes; no extreme halos

- [ ] **Integrate camera/light/fog uniforms into particle material**
  - Files: `tron-tunel-3/src/particles/hmParticles.js`
  - Verify: Particles respond visually to camera movement and lighting changes; uniform data consistent between passes

### Stage 3: Postprocess Chain (DOF + Optional FXAA & Vignette)

- [ ] **Build minimal postprocess pass infrastructure (manual ping-pong)**
  - Files: `tron-tunel-3/src/postprocess/postChain.js`, `tron-tunel-3/src/postprocess/postShaders.js`
  - Verify: Passes execute in correct order; fullscreen quad renders without seams; no RT leaks after resize

- [ ] **Implement DOF pass with depth-based focal point**
  - Files: `tron-tunel-3/src/postprocess/passes/dofPass.js`
  - Verify: Blur kernel responds to focal distance; horizontal + vertical achieve expected gaussian blur; DOF toggle disables without artifacts

- [ ] **Add optional FXAA and vignette passes**
  - Files: `tron-tunel-3/src/postprocess/passes/fxaaPass.js`, `tron-tunel-3/src/postprocess/passes/vignettePass.js`
  - Verify: FXAA toggles cleanly; vignette intensity tunable; final image composition is clean

- [ ] **Replace final render call with postprocess chain invocation**
  - Files: `tron-tunel-3/src/main.js`, `tron-tunel-3/src/state.js`
  - Verify: Final image output matches expected pass order; no frame rate cliff; toggles (enableDOF, enableFXAA, enableVignette, postEnabled, dofHalfRes) reduce VRAM/fill

## NICE-TO-HAVE

- [ ] **Advanced particle shadowing with shadow map integration**
  - Files: `tron-tunel-3/src/particles/hmParticleShadingStage2.js`
  - Verify: Particles correctly reject shadow-occluded zones; shadow quality matches art intent

- [ ] **Particle count and frequency scaling based on perf tier detection**
  - Files: `tron-tunel-3/src/particles/hmParticles.js`
  - Verify: Low-end devices default to quality=low; high-end scale to quality=high without user intervention

- [ ] **Interactive shader editor for particle and postprocess tuning**
  - Files: `tron-tunel-3/src/debug/shaderEditor.js`
  - Verify: Uniforms update live; shader edits compile without breaking game state

## Dependencies

- **none** required for core 3-stage implementation
- three v0.168.0 (already installed) provides all needed utilities
- Avoid: glslify; hyper-mix sources use includes but tron-tunel-3 must inline all shader helpers

## Open Questions

- Will Stage 2 shadows use `renderer.shadowMap` or simplified approximation? (Stage 1+2 can proceed without this decision.)
- Target device tier(s) for performance validation? (Affects default toggle values.)

## Effort

**Large** (3 major stages with distinct scopes; cumulative 2–3 days of focused implementation work assuming no gotchas in depth linearization or pass ordering)
