import * as THREE from 'three';
import { renderer, camera, sceneColorRT } from '../scene.js';
import { state } from '../state.js';
import { AudioMetadataBus } from '../audio/index.js';
import { PostChain }           from './postChain.js';
import { DOFPass }             from './passes/dofPass.js';
import { FXAAPass }            from './passes/fxaaPass.js';
import { HuePass }             from './passes/huePass.js';
import { VignettePass }        from './passes/vignettePass.js';
import { BlackAndWhitePass }   from './passes/bwPass.js';
import { GrainPass }           from './passes/grainPass.js';
import { InvertPass }          from './passes/invertPass.js';
import { PostTimelineManager } from './PostTimelineManager.js';
import { POST_TIMELINE }       from './postTimeline.js';

export let postChain     = null;
export let dofPass       = null;
export let fxaaPass      = null;
export let huePass       = null;
export let bwPass        = null;
export let grainPass     = null;
export let invertPass    = null;
export let vignettePass  = null;
export let postTimelineMgr = null;

let _hueSat = 1.0;

export function initPostprocessing() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  postChain = new PostChain(renderer, w, h);

  dofPass = new DOFPass(w, h, sceneColorRT.depthTexture);
  dofPass.setDOFParameters(
    state.dofFocalDistance, state.dofNearAmount, state.dofFarAmount,
    state.dofFocalRange, state.dofMaxRadius, camera.near, camera.far
  );
  postChain.addPass('dof_h', dofPass.getHorizontalMaterial());
  postChain.addPass('dof_v', dofPass.getVerticalMaterial());

  fxaaPass = new FXAAPass(w, h);
  postChain.addPass('fxaa', fxaaPass.getMaterial());

  huePass = new HuePass(w, h);
  postChain.addPass('hue', huePass.getMaterial());

  bwPass = new BlackAndWhitePass(w, h, 0.0);
  postChain.addPass('bw', bwPass.getMaterial());

  grainPass = new GrainPass(w, h);
  postChain.addPass('grain', grainPass.getMaterial());

  invertPass = new InvertPass(w, h, 0.0);
  postChain.addPass('invert', invertPass.getMaterial());

  vignettePass = new VignettePass(w, h, state.vignetteRadius, state.vignetteIntensity);
  postChain.addPass('vignette', vignettePass.getMaterial());

  postTimelineMgr = new PostTimelineManager(POST_TIMELINE);
  postTimelineMgr.setPasses({ huePass, bwPass, invertPass });

  console.log('Postprocessing chain initialized');
}

/** Audio-reactive pass updates — call every frame. */
export function updateAudioDrivenPasses(dt, postTime) {
  if (!huePass) return;
  huePass.update(postTime);
  grainPass?.update(postTime);
  grainPass?.setFromHeat(state.edgeHeat ?? 0);
  const af     = AudioMetadataBus.get();
  const energy = af.rms;
  _hueSat += (1.0 - Math.exp(-8.0 * dt)) * (1.0 + energy * 1.5 - _hueSat);
  huePass.setSaturation(_hueSat);
  huePass.setContrast(1.05 + energy * 0.1);
}

/** Advance timeline. */
export function tickTimeline(dt) {
  if (postTimelineMgr) postTimelineMgr.tick(dt);
}

/** Render postprocess chain (or blit fallback). */
export function executePostChain(rt) {
  if (!postChain) return;
  if (state.postEnabled) {
    postChain.execute(rt);
  } else {
    postChain.blitFallback(rt);
  }
}

/** Sync pass enable/disable/params from state each frame. */
export function updatePostprocessPasses() {
  if (!postChain) return;

  const hasDOFH = postChain.passes.find(p => p.name === 'dof_h');
  if (state.enableDOF && !hasDOFH && dofPass) {
    dofPass.setDOFParameters(
      state.dofFocalDistance, state.dofNearAmount, state.dofFarAmount,
      state.dofFocalRange, state.dofMaxRadius, camera.near, camera.far
    );
    postChain.addPass('dof_h', dofPass.getHorizontalMaterial());
    postChain.addPass('dof_v', dofPass.getVerticalMaterial());
  } else if (!state.enableDOF && hasDOFH) {
    postChain.removePass('dof_h');
    postChain.removePass('dof_v');
  } else if (state.enableDOF && hasDOFH && dofPass) {
    dofPass.setDOFParameters(
      state.dofFocalDistance, state.dofNearAmount, state.dofFarAmount,
      state.dofFocalRange, state.dofMaxRadius, camera.near, camera.far
    );
  }

  const hasFXAA = postChain.passes.find(p => p.name === 'fxaa');
  if (state.enableFXAA && !hasFXAA && fxaaPass) {
    postChain.addPass('fxaa', fxaaPass.getMaterial());
  } else if (!state.enableFXAA && hasFXAA) {
    postChain.removePass('fxaa');
  }

  const hasVignette = postChain.passes.find(p => p.name === 'vignette');
  if (state.enableVignette && !hasVignette && vignettePass) {
    vignettePass.setVignetteParameters(state.vignetteRadius, state.vignetteIntensity);
    postChain.addPass('vignette', vignettePass.getMaterial());
  } else if (!state.enableVignette && hasVignette) {
    postChain.removePass('vignette');
  } else if (state.enableVignette && hasVignette && vignettePass) {
    vignettePass.setVignetteParameters(state.vignetteRadius, state.vignetteIntensity);
  }
}

/** Handle canvas resize for all postprocess passes. */
export function resizePostprocess(w, h) {
  if (postChain)  postChain.resize(w, h);
  if (dofPass)    dofPass.resize(w, h);
  if (fxaaPass)   fxaaPass.resize(w, h);
  if (huePass)    huePass.resize(w, h);
  if (bwPass)     bwPass.resize(w, h);
  if (grainPass)  grainPass.resize(w, h);
  if (invertPass) invertPass.resize(w, h);
}
