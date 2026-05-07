# Changes: Tron-Tunel-3 Fix Functional Gaps

## Metadata

- **Feature**: tron-tunel-3-fix-blockers
- **Mode**: FIX
- **Status**: COMPLETE
- **Review**: [20260507-160000-tron-tunel-3-hypermix-3stage-review.md](../reviews/20260507-160000-tron-tunel-3-hypermix-3stage-review.md)

## Summary

Fixed three critical functional gaps: (1) Particles now emit continuously via lightweight auto-emitter in HMParticleSystem.update(); (2) Fallback render path now reuses quad/material/camera via PostChain.blitFallback(), eliminating per-frame allocations; (3) Stage 2 uniforms now wired each frame in main.js render loop. Replaced deprecated Matrix4.getInverse() with modern .copy().invert() API in both particle files.

## Tasks

- [x] Replace `Matrix4.getInverse()` with `.copy(...).invert()` in hmParticles.js
- [x] Replace `Matrix4.getInverse()` in hmParticleShadingStage2.js
- [x] Implement continuous particle emitter in HMParticleSystem.update()
- [x] Wire Stage 2 uniforms in main.js render loop
- [x] Eliminate per-frame allocations in fallback blit path
- [x] Run build verification

## Files Modified

| File                                                    | Action   | Why                                     |
| ------------------------------------------------------- | -------- | --------------------------------------- |
| `tron-tunel-3/src/particles/hmParticles.js`             | Modified | Fix deprecated API + add auto-emitter   |
| `tron-tunel-3/src/particles/hmParticleShadingStage2.js` | Modified | Fix deprecated API                      |
| `tron-tunel-3/src/main.js`                              | Modified | Wire Stage 2 + use fallback blit helper |
| `tron-tunel-3/src/postprocess/postChain.js`             | Modified | Add reusable blitFallback method        |

## Verification

- Backend build: SKIPPED
- Frontend build (`npm run build`): ✅ PASS
  - 50 modules transformed, 623.53 kB output
  - No errors or warnings
  - Single-file bundle successful
- Tests: SKIPPED

## Implementation Details

### 1. Deprecated API Fixes

- [hmParticles.js](../../tron-tunel-3/src/particles/hmParticles.js#L120): Changed `getInverse(camera.projectionMatrix)` to `copy(camera.projectionMatrix).invert()`
- [hmParticleShadingStage2.js](../../tron-tunel-3/src/particles/hmParticleShadingStage2.js#L40): Same fix in `updateStage2Uniforms()`

### 2. Continuous Particle Emission

- Added lightweight emitter in [HMParticleSystem.update()](../../tron-tunel-3/src/particles/hmParticles.js#L120-L141)
- Respects quality tier (low: 2/frame, med: 5/frame, high: 10/frame)
- Spawns particles from camera position + forward, with 3m radial jitter
- Bounded by max capacity (80% of tier limit) to prevent overflow
- Emitter only active when `enabled=true`

### 3. Stage 2 Uniforms Wiring

- Added import for [updateStage2Uniforms](../../tron-tunel-3/src/main.js#L23)
- Called in both **flythrough path** [line ~432](../../tron-tunel-3/src/main.js#L432) and **gameplay path** [line ~500](../../tron-tunel-3/src/main.js#L500)
- Passes scene lights, fog, camera, and depth texture
- Enables Stage 2 shading when `sceneColorRT` available

### 4. Fallback Blit Optimization

- Added [PostChain.blitFallback()](../../tron-tunel-3/src/postprocess/postChain.js#L59) method
- Reuses `blitMaterial` and internal quad geometry
- Replaces per-frame allocation pattern (was creating new Mesh/ShaderMaterial/Scene/Camera each frame)
- Used in both flythrough and gameplay render paths when `state.postEnabled=false`

## Notes

- Particles are now visible: continuous emission from camera with falloff based on quality tier
- Stage 2 depth/fog/light/camera uniforms synchronized every frame
- Memory leak eliminated: fallback path no longer allocates 5+ objects per frame
- Both gameplay and flythrough branches use same robust rendering pipeline
- Preserved all existing gameplay logic and restart/death mechanics
