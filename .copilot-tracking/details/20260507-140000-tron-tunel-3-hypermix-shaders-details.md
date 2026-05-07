# Details: Tron-Tunel-3 Hyper-Mix Shader Integration (3 Stages)

## Metadata

- **Feature**: tron-tunel-3-hypermix-shaders-3-stage
- **Status**: COMPLETE
- **Plan**: [20260507-140000-tron-tunel-3-hypermix-shaders-plan.md](.copilot-tracking/plans/20260507-140000-tron-tunel-3-hypermix-shaders-plan.md)

## Implementation Notes

### Stage 1: Curl-Flow Particles Baseline

#### Task 1: Initialize Particle System Module

- **Scope**: Create isolated particle system spawning GPU-based points with curl-flow motion from seeded procedural noise (no GPGPU ping-pong textures). Architecture follows existing sparks.js lifecycle (init, resize, update, dispose) using Points geometry with seed/spawnTime/side/size attributes.

- **Files**:
  - Add: `tron-tunel-3/src/particles/hmParticles.js`
  - Add: `tron-tunel-3/src/particles/hmParticlesShaders.js`
  - Modify: `tron-tunel-3/src/main.js` (call particle.update, particle.render, particle.dispose)

- **Pattern**: Follow sparks.js for lifecycle; follow hyper-mix/src/3d/particles.js for Points + BufferGeometry setup; use three.js ShaderMaterial with inlined curl noise (no glslify). Use RawShaderMaterial or standard ShaderMaterial depending on existing tron-tunel-3 convention.

- **Main checks**:
  1. Particles render in both gameplay and flythrough with additive blend (depthWrite=false, depthTest=true)
  2. Curl motion updates smoothly; no jitter or discontinuities as particles age
  3. Build and dev server run; no shader compilation errors

#### Task 2: Wire Particle Updates into Main Loop

- **Scope**: Insert `particleSystem.update(dt, elapsedTime, camera, state)` before final `renderer.render()` in both gameplay tick path and flythrough camera path. Ensure no render-order divergence between branches.

- **Files**: `tron-tunel-3/src/main.js`

- **Pattern**: Call `particleSystem.update()` between "update camera/uniforms" and "final render"; render particles as scene child or explicit call depending on Stage 1 architecture choice.

- **Main checks**:
  1. Particles visible in both modes
  2. No frame rate regression (baseline maintained, +0 to +3% overhead acceptable)
  3. Collision/death/respawn flow untouched; state.carAlive, carGroup transforms unaffected

#### Task 3: Expose Toggles and Quality Presets

- **Scope**: Add state flags for runtime particle control: `enableParticles` (bool), `particlesQuality` ('low'|'med'|'high'), `particlesHalfResBuffer` (bool). Defaults: true, 'med', false.

- **Files**: `tron-tunel-3/src/state.js`

- **Pattern**: Similar to existing perf/quality toggles; quality preset affects particle count and update frequency (e.g., low=100 pts @ 0.5x, med=300 @ 1.0x, high=800 @ 1.0x).

- **Main checks**:
  1. Quality presets control particle count proportionally
  2. `enableParticles` toggle kills all particles without console errors or memory leaks

---

### Stage 2: Depth-Aware Particles with Fog & Shadow Ideas

#### Task 1: Render-Target Pipeline Setup

- **Scope**: Replace direct `renderer.render(scene, camera)` with two-pass indirect: (1) Render scene + particles into sceneColorRT with attached DepthTexture; (2) Compose final output. Enables depth reconstruction in particle shading and postprocess. Handle resizes to maintain RT aspect and DPR scaling.

- **Files**:
  - Modify: `tron-tunel-3/src/main.js` (add sceneColorRT setup, resize logic, render target binding)

- **Pattern**: Create `WebGLRenderTarget(w, h, {format: RGBAFormat, depthTexture: DepthTexture(w, h, UnsignedIntType)})`; call `renderer.setRenderTarget(sceneColorRT)` before render; call `renderer.setRenderTarget(null)` after, then blit or compose to screen. Follow three.js examples/webgl_postprocessing.html pattern.

- **Main checks**:
  1. Scene renders to target without color banding or artifacting
  2. DepthTexture data accessible and sampled correctly in shaders
  3. Resize hook maintains correct aspect and DPR

#### Task 2: Adapt Hyper-Mix Particle Shading (Depth + Fog + Shadow Ideas)

- **Scope**: Transition particle shader from basic additive to depth-aware additive with fog term and optional simplified shadow sampling. Read camera projection/world matrices and light position from uniforms; reconstruct linear depth; apply fog falloff based on particle distance to camera.

- **Files**:
  - Add: `tron-tunel-3/src/particles/hmParticleShadingStage2.js`
  - Modify: `tron-tunel-3/src/particles/hmParticles.js` (switch material to Stage2 variant; update uniforms per frame)

- **Pattern**: Port logic from POC/hyper-mix/src/glsl/particles.frag (depth linearization, fog calculation, optional simplified spot/directional shadow). Use inline helper functions for `depthToLinear()` and shadow decode; don't copy glslify includes. Match fog color to `tunnel.js` fog setup; ensure linearization matches camera near/far.

- **Main checks**:
  1. Particles fade/occlude where scene geometry overlaps (test near tunnel wall)
  2. Fog transition smooth across FOV changes (test gameplay-to-flythrough transition)
  3. No severe halos at depth boundaries (off-by-one samples, incorrect matrix math)

#### Task 3: Integrate Camera/Light/Fog Uniforms

- **Scope**: Thread camera world matrix, projection matrix inverse, fog parameters, and light position (if using shadows) into particle material uniforms. Update each frame before particle render.

- **Files**:
  - Modify: `tron-tunel-3/src/particles/hmParticles.js` (uniform update loop)
  - Read from: `tron-tunel-3/src/camera.js`, `tron-tunel-3/src/tunnel.js`, `tron-tunel-3/src/main.js`

- **Pattern**: Extract matrices/params in main loop; pass to `particleSystem.setUniforms({cameraMatrix, projectionInverse, fogColor, fogDensity, lightPos})`; update material.uniforms each frame.

- **Main checks**:
  1. Particles respond visually to camera dolly (focal depth changes)
  2. Fog color consistent with tunnel theme
  3. No jumping/popping when light or camera state changes

---

### Stage 3: Postprocess Chain (DOF + Optional FXAA & Vignette)

#### Task 1: Postprocess Pass Infrastructure

- **Scope**: Build minimal postprocess composition (no EffectComposer). Implements: render-target ping-pong, fullscreen quad mesh, and ordered pass execution. Supports DOF (horizontal + vertical separable blur), FXAA, and vignette in that order. Manages all RT alloc/resize/dispose.

- **Files**:
  - Add: `tron-tunel-3/src/postprocess/postChain.js`
  - Add: `tron-tunel-3/src/postprocess/postShaders.js`

- **Pattern**: Follow hyper-mix/src/3d/postprocessing.js: minimal PostChain class with `addPass(name, passMaterial, uniforms)` and `execute(renderer, inputRT)` methods. Use RawShaderMaterial or ShaderMaterial with simple fullscreen vertex shader.

- **Main checks**:
  1. Fullscreen quad renders edge-to-edge without seams
  2. Pass order deterministic (DOF → FXAA → vignette)
  3. No RT leaks or stale sampler bindings after resize

#### Task 2: DOF Pass with Focal Point

- **Scope**: Implement separable Gaussian DOF (horizontal + vertical blur). Focal point (world units) read from camera state each frame. Blur kernel radius scales with distance-from-focal. Uses depth texture from Stage 2 render target.

- **Files**:
  - Add: `tron-tunel-3/src/postprocess/passes/dofPass.js`
  - Modify: `tron-tunel-3/src/postprocess/postShaders.js` (add dofHorizontal.frag, dofVertical.frag)

- **Pattern**: Port POC/hyper-mix/src/glsl/dof.frag. Use two passes: (1) horizontal blur into temporary RT, (2) vertical blur into output RT. Read focal distance from camera module or state (default: fixed distance, or adaptive per gameplay mode). Ensure depth linearization matches Stage 2.

- **Main checks**:
  1. Blur kernel is zero when focal distance is far; increases as camera approaches focal plane
  2. Horizontal then vertical separation produces expected gaussian blur
  3. `enableDOF` toggle reduces frame time; disabling removes blur without artifacts

#### Task 3: FXAA and Vignette Passes (Optional)

- **Scope**: Add two optional single-pass filters: FXAA (edge-aware anti-aliasing) and vignette (darkening falloff). FXAA runs after DOF to catch high-frequency edges; vignette runs last for final grading. Both toggleable at runtime.

- **Files**:
  - Add: `tron-tunel-3/src/postprocess/passes/fxaaPass.js`
  - Add: `tron-tunel-3/src/postprocess/passes/vignettePass.js`
  - Modify: `tron-tunel-3/src/postprocess/postShaders.js` (add fxaa.frag, vignette.frag)

- **Pattern**: Port POC/hyper-mix/src/glsl/fxaa.frag and vignette.frag; expose vignette radius and intensity as uniforms for art tuning. FXAA params can be constants (lumaThreshold, mulReduce, minReduce typical values).

- **Main checks**:
  1. `enableFXAA` toggle reduces jagged edges; disabling doesn't break subsequent vignette
  2. Vignette falloff (uniform vignetteRadius, vignetteIntensity) adjustable and smooth
  3. Pass order (DOF → FXAA → vignette) preserved when toggles change

#### Task 4: Replace Final Render with Postprocess Chain

- **Scope**: Modify main.js to invoke postprocess composition instead of direct `renderer.render(scene, camera)`. Pipeline: (1) scene + particles rendered to sceneColorRT in Stage 2, (2) postprocess chain applied (DOF + FXAA + vignette), (3) final RT blitted to screen.

- **Files**:
  - Modify: `tron-tunel-3/src/main.js` (replace renderer.render with postChain.execute)
  - Modify: `tron-tunel-3/src/state.js` (add postEnabled master toggle, dofHalfRes)

- **Pattern**: Call `postChain.render(renderer, sceneColorRT, {enableDOF, enableFXAA, enableVignette, dofHalfRes, ...})` in both flythrough and gameplay branches after particle updates. Unify both branches to use the same final composition.

- **Main checks**:
  1. Final pixel output is correct: no color shifts, correct aspect, no tiling
  2. `dofHalfRes` toggle reduces fill load and frame time without severe aliasing
  3. `postEnabled` master toggle (false) skips all passes and renders sceneColorRT directly with minimal overhead

---

## Dependencies

- **none** required for Stage 1–3 implementation
- three v0.168.0 (already installed) provides all needed utilities
- Optional: three/examples/jsm/postprocessing available if desired (not required)
- **Avoid**: glslify; hyper-mix sources use includes, but tron-tunel-3 must inline all shader helpers

## Risks

1. **Depth Linearization Mismatch** (Stage 2–3):
   - If near/far or camera projection matrix changes without updating particle/DOF uniforms, halos and artifacts appear.
   - _Mitigation_: Extract matrices/params in main loop before each render; validate near/far against actual camera setup.

2. **Fill-Rate Bottleneck** (Stage 3, esp. high-DPR):
   - DOF + particles + tunnel shaders at high resolution can exceed GPU fill budget on mid-tier devices.
   - _Mitigation_: `dofHalfRes` and `postEnabled` toggles; default DOF off on auto-detected low-end devices.

3. **Render-Target Resize Bugs**:
   - RT aspect and DPR scaling must sync with canvas; mismatch causes black borders or upsampling artifacts.
   - _Mitigation_: Test resize heavily (window resize, orientation change); bake aspect correction into compose shader.

4. **Pass Order Drift** (if toggles added incrementally):
   - FXAA before DOF or vignette in wrong position degrades quality.
   - _Mitigation_: Hard-code pass order in postChain.js; unit-test pass execution order in isolation.

5. **Hyper-Mix Shader Porting Gaps**:
   - hyper-mix sources assume glslify, specific depth/shadow conventions, older three.js API; direct copy will not compile.
   - _Mitigation_: Manually inline all #include directives; test depth linearization visually against actual scene depth.

## Rollback Strategy

- **Stage 1 fails**: Comment out `particle.update()` and `particle.render()` calls in main.js; delete particles/ folder. Restores baseline.
- **Stage 2 fails**: Remove sceneColorRT setup; revert to direct `renderer.render(scene, camera)`; disable particle Stage2 shading. Particles fall back to Stage 1 additive or disabled.
- **Stage 3 fails**: Remove `postChain.execute()` call; restore direct `renderer.render(scene, camera)` or Stage 2 sceneColorRT blit. Postprocess disabled without affecting gameplay.

## Verification Checklist

- [ ] **Build**: `cd tron-tunel-3 && npm.cmd run build` succeeds with no shader compilation errors
- [ ] **Dev Server**: `cd tron-tunel-3 && npm.cmd run dev` serves without console warnings
- [ ] **Stage 1 Gameplay**: Launch gameplay mode; particles visible, no collision regressions, 60 fps baseline maintained
- [ ] **Stage 1 Flythrough**: Switch to flythrough; particles visible and move smoothly, no camera jitter
- [ ] **Stage 2 Depth**: Particles occluded by tunnel geometry as expected; no halos or extreme popping at depth boundaries
- [ ] **Stage 2 Fog**: Particle fade smooth across camera FOV transitions (gameplay ↔ flythrough)
- [ ] **Stage 3 DOF**: Blur kernel activates/deactivates correctly; focal plane is visually stable
- [ ] **Stage 3 FXAA**: Edge aliasing reduced; DOF + FXAA combination is sharp; no ghosting
- [ ] **Stage 3 Vignette**: Falloff intensity and radius tunable; final image grading is balanced
- [ ] **Toggles**: All quality/enable flags (enableParticles, enableDOF, enableFXAA, enableVignette, postEnabled, dofHalfRes) reduce frame time or toggle effects as expected
- [ ] **Resize**: Window resize (and mobile orientation change) maintains RT aspect and visual stability
