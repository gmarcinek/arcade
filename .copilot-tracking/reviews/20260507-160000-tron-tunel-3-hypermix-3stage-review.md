# Review: Tron-Tunel-3 Hyper-Mix 3-Stage Integration

## Metadata

- **Feature**: tron-tunel-3-hypermix-shaders-3-stage
- **Status**: COMPLETE (with blockers)
- **Changes file**: [20260507-150000-tron-tunel-3-hypermix-full-implementation-changes.md](../changes/20260507-150000-tron-tunel-3-hypermix-full-implementation-changes.md)
- **Plan**: [20260507-140000-tron-tunel-3-hypermix-shaders-plan.md](../plans/20260507-140000-tron-tunel-3-hypermix-shaders-plan.md)
- **Details**: [20260507-140000-tron-tunel-3-hypermix-shaders-details.md](../details/20260507-140000-tron-tunel-3-hypermix-shaders-details.md)
- **Verdict**: **NEEDS_CHANGES**

## Build Status

- **Frontend build (`npm run build`)**: ✅ PASS
  - 49 modules transformed, 622.42 kB output
  - No shader compilation errors during build
  - Static analysis passes

- **Runtime verification**: ❌ BLOCKER FOUND
  - Critical: Three.js API compatibility issue in particle system

## Blockers

### 1. **Matrix4.getInverse() API deprecated — runtime crash**

**Files affected:**

- [src/particles/hmParticles.js](../../tron-tunel-3/src/particles/hmParticles.js#L133)
- [src/particles/hmParticleShadingStage2.js](../../tron-tunel-3/src/particles/hmParticleShadingStage2.js#L73)

**Issue:**
The code calls `matrix.getInverse(otherMatrix)`, which was removed in Three.js r160+. Package.json specifies `"three": "^0.168.0"`, which does not support this API.

**Impact:**

- First particle system update will crash with: `TypeError: matrix.getInverse is not a function`
- Affects both Stage 1 gameplay and flythrough modes (both call `particleSystem.update()`)
- Both gameplay and flythrough branches will fail to render

**Fix:**
Replace both instances with the modern Three.js API:

```javascript
// OLD (broken):
this.uniforms.cameraProjectionMatrixInverse.value.getInverse(
  camera.projectionMatrix,
);

// NEW (correct):
this.uniforms.cameraProjectionMatrixInverse.value
  .copy(camera.projectionMatrix)
  .invert();
```

**Verification:** Two instances found:

- Line 133 in hmParticles.js: `update()` method
- Line 73 in hmParticleShadingStage2.js: `updateStage2Uniforms()` function

---

## Architecture Verification

✅ **Render loop integration**: Both gameplay and flythrough branches correctly call:

- `particleSystem.update()` before render
- `renderer.setRenderTarget(sceneColorRT)` for Stage 2 pipeline
- `postChain.execute(sceneColorRT)` for Stage 3 effects
- Resize handlers maintain all RT dimensions

✅ **State management**: All toggles present in state.js:

- `enableParticles`, `particlesQuality` (Stage 1)
- `postEnabled`, `enableDOF`, `enableFXAA`, `enableVignette` (Stage 3)
- Parameters: `dofFocalDistance`, `vignetteRadius`, `vignetteIntensity`

✅ **Pass ordering**: PostChain correctly implements DOF (horizontal → vertical) → FXAA → Vignette pipeline

✅ **Module structure**: All 10 new/modified files exist and export correctly:

- Particle system: `HMParticleSystem` class with lifecycle methods
- Passes: `DOFPass`, `FXAAPass`, `VignettePass` classes with material getters
- PostChain: `PostChain` class with add/remove/execute methods
- Shaders: All GLSL inlined, no glslify dependencies

---

## Summary

**Frontend build succeeds, but runtime will crash on particle update.** The Three.js API mismatch (`getInverse` removed in r160+) must be fixed before deployment. Once the two lines are corrected to use `.copy().invert()`, the 3-stage integration should function as designed with proper particle rendering, depth-aware shading, and postprocessing chains in both gameplay and flythrough modes.

**Effort to fix:** ~2 minutes (replace two lines).
