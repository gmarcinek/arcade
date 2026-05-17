import { renderer, scene, camera, sceneColorRT, createRenderTargets } from './scene.js';
import { settings, initSettingsUI }     from './hud/settings.js';
import { CFG, RESTART_SPAWN_M }         from './config.js';
import { setupInput }                   from './input.js';
import { setupTouchInput }              from './input/touchInput.js';
import { updateFPS }                    from './hud/hud.js';
import { AudioMetadataBus }             from './audio/index.js';
import { audioSystem, backgroundLayer } from './game/world.js';
import {
  initPostprocessing,
  updatePostprocessPasses,
  updateAudioDrivenPasses,
  tickTimeline,
  executePostChain,
  resizePostprocess,
} from './postprocess/manager.js';
import {
  flythroughActive,
  updateFlythroughCamera,
  startFlythrough,
  stopFlythrough,
} from './game/flythrough.js';
import { startGame, tick } from './game/flow.js';

// ---- Resize ----
function resize() {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const res  = settings.renderRes || 0;
  let rw, rh;
  if (res === 0) {
    rw = winW;
    rh = winH;
  } else {
    rh = Math.min(res, winH);
    rw = Math.round(rh * winW / winH);
  }
  renderer.setSize(rw, rh, false);
  camera.aspect = rw / Math.max(1, rh);
  camera.updateProjectionMatrix();
  if (sceneColorRT) sceneColorRT.setSize(rw, rh);
  resizePostprocess(rw, rh);
}

resize();
window.addEventListener('resize', resize);

createRenderTargets();
initPostprocessing();
setupInput();
setupTouchInput();

// ---- Main loop ----
let lastT = performance.now();

function loop(t) {
  const frameMinMs = settings.targetFps > 0 ? 1000 / settings.targetFps : 0;
  if (frameMinMs > 0 && t - lastT < frameMinMs) {
    requestAnimationFrame(loop);
    return;
  }

  const dt          = Math.min(0.05, (t - lastT) / 1000);
  const elapsedTime = t / 1000;
  const postTime    = performance.now() * 0.001;
  lastT = t;

  updateFPS(dt);
  updateAudioDrivenPasses(dt, postTime);
  tickTimeline(dt);

  if (flythroughActive) {
    updateFlythroughCamera(dt);
    audioSystem.tick(dt);
    backgroundLayer.update(elapsedTime, camera);
    renderer.setRenderTarget(sceneColorRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    executePostChain(sceneColorRT);
    requestAnimationFrame(loop);
    return;
  }

  tick(dt);
  audioSystem.tick(dt);
  backgroundLayer.update(elapsedTime, camera);

  const audioFrame = AudioMetadataBus.current;
  if (audioFrame?.bpm) {
    const bpmEl = document.getElementById('audio-bpm');
    if (bpmEl) bpmEl.textContent = Math.round(audioFrame.bpm) + ' BPM';
  }

  updatePostprocessPasses();
  renderer.setRenderTarget(sceneColorRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  executePostChain(sceneColorRT);

  requestAnimationFrame(loop);
}

// ---- UI wiring ----
document.getElementById('start-btn').addEventListener('click', () => {
  startGame(RESTART_SPAWN_M);
  audioSystem.startMusic();   // no-op if audio-reactive is already active
});
document.getElementById('flythrough-btn')?.addEventListener('click', startFlythrough);

const hudRestartBtn = document.getElementById('hud-restart-btn');
if (hudRestartBtn) hudRestartBtn.addEventListener('click', () => startGame(RESTART_SPAWN_M));

const diffSelect = document.getElementById('difficulty-select');
if (diffSelect) {
  diffSelect.addEventListener('change', () => {
    CFG.tunnelAngularGravity = parseFloat(diffSelect.value);
  });
  // On mobile, default to EASY (value 10)
  if (window.innerWidth <= 600 || navigator.maxTouchPoints > 1) {
    diffSelect.value = '10';
    CFG.tunnelAngularGravity = 10;
  }
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'r') {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && flythroughActive) stopFlythrough();
});

initSettingsUI(resize);
requestAnimationFrame(loop);