# Research: Tron Tunel 3 Hyper-Mix Shader Integration (3 stages)

## Metadata

- **Feature**: tron-tunel-3-hypermix-shaders-3-stage
- **Status**: COMPLETE

## Scope

Research implementation-ready integration path for adding selected hyper-mix particle and post-processing shaders into tron-tunel-3 in three sequential stages:

1. curl-flow particles baseline
2. particle shading with depth/fog/shadow ideas
3. post-process DOF + optional FXAA/vignette

## Repo Findings

### Relevant Files

- tron-tunel-3/src/main.js
  - Current render entry point and game loop.
  - Scene, camera, renderer initialization and resize.
  - Single forward render path (renderer.render(scene, camera)).
  - Existing per-frame hooks where particle sim/update and postprocess chain can be inserted.

- tron-tunel-3/src/sparks.js
  - Existing particle-like VFX implemented with InstancedMesh (sparks + debris).
  - Good pattern for incremental Stage 1 without adding heavy infrastructure.

- tron-tunel-3/src/camera.js
  - Camera behavior and FOV dynamics used by gameplay/procedural mode.
  - DOF focal strategy should read camera state from here/state.

- tron-tunel-3/src/tunnel.js
  - Tunnel ShaderMaterial setup and uniforms already audio-reactive.
  - Useful context for fog/color harmonization with particle shading.

- tron-tunel-3/src/shaders.js
  - Core tunnel shader with depth-like attenuation by player Z.
  - Existing visual language to match in Stage 2 and Stage 3.

- tron-tunel-3/package.json
  - Only three and vite are present; no glslify/postprocess wrappers.

- POC/hyper-mix/src/glsl/position.frag
  - Source curl-flow particle simulation reference (ping-pong FBO style).

- POC/hyper-mix/src/glsl/particles.frag
  - Source particle shading reference with depth reconstruction, fog and spot shadow sampling.

- POC/hyper-mix/src/glsl/particlesAdditive.vert
- POC/hyper-mix/src/glsl/particlesAdditive.frag
- POC/hyper-mix/src/glsl/particlesDepth.vert
- POC/hyper-mix/src/glsl/particlesDepth.frag
  - Intermediate depth/additive particle buffers used before final shading in hyper-mix.

- POC/hyper-mix/src/glsl/dof.frag
- POC/hyper-mix/src/glsl/fxaa.frag
- POC/hyper-mix/src/glsl/vignette.frag
  - Postprocess references for Stage 3.

- POC/hyper-mix/src/3d/simulator.js
- POC/hyper-mix/src/3d/particles.js
- POC/hyper-mix/src/3d/postprocessing.js
  - Runtime wiring reference (render target flow and pass order).

### Existing Patterns

- Current tron-tunel-3 pipeline is direct forward rendering with no EffectComposer and no pass graph.
- Render loop hooks:
  - Flythrough branch: updateFlythroughCamera -> audio/background/tunnel uniforms -> renderer.render.
  - Gameplay branch: tick -> audio/background/tunnel uniforms -> renderer.render.
- Existing VFX are updated each frame from main tick via updateSparks(dt) and updateDebris(dt).
- Existing particle rendering already uses additive blending and depthWrite false in sparks, which matches Stage 1 baseline visual constraints.
- No renderer shadow pipeline setup in tron-tunel-3 (no renderer.shadowMap.enabled in main), despite hyper-mix particle shader expecting spot shadow data.

### Dependencies

- Installed:
  - three ^0.168.0
  - vite ^5.0.0
  - vite-plugin-singlefile ^2.3.3

- Needed if chosen approach is implemented:
  - none required for minimal staged integration
  - optional: use modules from three/examples/jsm/postprocessing (already in three package, no npm add required)
  - avoid glslify for initial implementation (hyper-mix relies on glslify include syntax; tron-tunel-3 currently does not)

## Recommendation

Single recommended approach: implement in 3 strict stages, keeping Stage 1 lightweight and production-safe before introducing depth-dependent shading or full-screen passes.

Current pipeline entry points and safest insertion:

- EffectComposer usage today: not used.
- Safest incremental insertion point:
  - keep all game logic unchanged,
  - replace only final draw in main loop:
    - from renderer.render(scene, camera)
    - to renderer.setRenderTarget(sceneColorRT) + full-screen compose draw (manual ping-pong) first,
    - optionally migrate to EffectComposer only after Stage 3 is stable.
- Primary hook for particle updates:
  - call particleSystem.update(dt, elapsedTime, frame/camera/state) in both flythrough and gameplay branches before final render.

Stage 1 minimal viable architecture (without full GPGPU):

- Use a stateless/procedural GPU points baseline OR CPU-light pooled particle attributes (existing sparks pattern) instead of ping-pong float simulation.
- Suggested MVP:
  - New isolated module creates Points with BufferGeometry attributes (seed, spawnTime, side, size).
  - Vertex shader computes motion using simplified curl/noise function based on seed + time (no texture position feedback).
  - Fragment shader starts from hyper-mix particlesAdditive visual logic for circular sprite/soft depth feel, but no depth buffer dependency yet.
  - Keep additive blending and depthWrite false; depthTest true.
- Why this first:
  - minimal moving parts,
  - no float texture capability pitfalls,
  - validates aesthetic fit and runtime cost early.

Stage 2 required data and risks (depth/fog/shadow ideas):

- Required data to port hyper-mix-like shading:
  - scene depth texture (DepthTexture attached to a color render target)
  - camera projection matrix + inverse
  - camera world matrix / inverse rotation basis
  - light position in world space
  - optional shadow matrix + shadow map if true shadowing is required
  - fog color/params aligned with scene fog
- Risks:
  - hyper-mix shader assumes packed shadow map compare path and custom decode; adapting to current three shadow data may be non-trivial.
  - DOF and particle shading both need consistent depth space conventions; wrong linearization causes halos/popping.
  - current tunnel and additive effects are bright; particle fog/shadow can look muddy unless tone is tuned.
  - extra depth prepass/render-target work increases fill cost significantly at high DPR.

Stage 3 pass ordering recommendation:

- Recommended order for visual stability and cost:
  1.  Scene + particles into sceneColorRT with shared depth
  2.  DOF horizontal blur pass
  3.  DOF vertical blur pass
  4.  FXAA pass (optional, after blur)
  5.  Vignette pass (optional, final stylistic grade)
- Rationale:
  - FXAA after DOF catches high-frequency edges introduced by blur compositing.
  - Vignette last preserves intended falloff after all anti-aliasing/blur.
- Toggle policy:
  - DOF off by default on low tier,
  - FXAA default on,
  - vignette default subtle on/off by art direction.

Concrete file-level change map by stage:

Stage 1 (curl-flow baseline)

- Modify: tron-tunel-3/src/main.js
  - initialize particle module after scene/camera setup
  - call particle update/render hook in both loop branches
  - expose resize hook for particle resolution uniforms
- Add: tron-tunel-3/src/particles/hmParticles.js
  - particle system lifecycle (init, resize, update, dispose)
- Add: tron-tunel-3/src/particles/hmParticlesShaders.js
  - stage 1 vertex/fragment shader strings with inline helper noise/curl code
- Optional modify: tron-tunel-3/src/state.js
  - perf toggles and runtime quality flags

Stage 2 (depth/fog/shadow ideas)

- Modify: tron-tunel-3/src/main.js
  - add sceneColorRT + DepthTexture setup and resize handling
  - render scene to target before final compose
  - pass camera/depth/light uniforms into particle shading
- Modify: tron-tunel-3/src/particles/hmParticles.js
  - switch to depth-aware shading path
  - optional extra additive/depth intermediate targets only if needed
- Add: tron-tunel-3/src/particles/hmParticleShadingStage2.js
  - adapted particles.frag path with fog/depth reconstruction and optional simplified shadow term

Stage 3 (DOF + optional FXAA/vignette)

- Modify: tron-tunel-3/src/main.js
  - replace direct renderer.render with postprocess chain invocation
- Add: tron-tunel-3/src/postprocess/postChain.js
  - small ping-pong manager (render targets + full-screen quad)
- Add: tron-tunel-3/src/postprocess/passes/dofPass.js
- Add: tron-tunel-3/src/postprocess/passes/fxaaPass.js
- Add: tron-tunel-3/src/postprocess/passes/vignettePass.js
- Add: tron-tunel-3/src/postprocess/postShaders.js
  - inlined/adapted shader strings from hyper-mix references

Existing scene/camera/render integration hooks to reuse:

- main.js tick path already updates camera via updateCamera(dt, camera, carGroup, frame).
- background and tunnel uniforms are updated just before final render, so particle/post hooks should run between these updates and final draw.
- flythrough and gameplay branches both must execute the same final render abstraction to avoid divergence.

Performance risks and fallback toggles:

- Key risks:
  - Full-resolution DOF + depth-aware particles is fill-rate heavy.
  - High DPR already enabled up to 2.0; postprocess at full DPR can halve fps on mid GPUs.
  - Additional render targets increase VRAM pressure and bandwidth.
- Recommended toggles:
  - enableParticles (master)
  - particlesQuality: low/med/high (count + update rate)
  - particlesHalfResBuffer (for additive/depth intermediates)
  - enableDOF
  - dofHalfRes
  - enableFXAA
  - enableVignette
  - postEnabled (single kill-switch)

Note on compatibility gap with hyper-mix sources:

- hyper-mix runtime uses glslify, raw shader prefixing, and an older render-target API style.
- tron-tunel-3 should port shader logic, not copy runtime wiring 1:1.

## Gotchas

- glslify pragmas in hyper-mix shaders will not compile directly in current tron-tunel-3 setup.
- hyper-mix particle shading expects depth conventions and packed shadow decode that differ from default three r168 usage.
- Stage 2 shadowing depends on proper renderer shadow setup and consistent light/shadow camera params.
- DOF based on distance texture is sensitive to incorrect near/far linearization.
- Keeping separate flythrough/gameplay branches without shared final render function can cause feature drift.

## Verification

- Frontend build: `cd tron-tunel-3 && npm.cmd run build`
- Runtime smoke: `cd tron-tunel-3 && npm.cmd run dev`
- Functional checks after each stage:
  - Stage 1: particles visible in both gameplay and flythrough; no logic regression in collision/death/respawn flow.
  - Stage 2: particles correctly occluded by scene depth; fog response stable across camera FOV transitions; no severe halos.
  - Stage 3: pass order behaves as expected (DOF then optional FXAA then optional vignette), and fps fallback toggles work at runtime.
