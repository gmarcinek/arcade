import * as THREE from 'three';
import { BALL_PHYS, BASE_SPEED_START, DEATH_BLAST_DURATION_S, EDGE_HEAT_ZONE_M, OUT_OF_BOUNDS_KILL_S, RESTART_SPAWN_M } from './config.js';
import { generateDemoTrack, createDemoChunkManager } from './procedural/generateDemoTrack.js';
import { DebugTrackRenderer } from './procedural/debugTrackRenderer.js';
import { createInfiniteSpline } from './procedural/infiniteSpline.js';
import { InfiniteMesh } from './procedural/infiniteMesh.js';
import { createCrossSection } from './procedural/crossSection.js';
import { initPlayerSurface, updatePlayerSurface } from './procedural/playerSurface.js';
import { initPlayerSurfaceBasis, getPlayerFrame } from './procedural/playerSurfaceBasis.js';
import { state } from './state.js';
import { input, setupInput } from './input.js';
import { createTunnel } from './tunnel.js';
import { createBall, updateCarVisuals, updateBallPositionFromFrame } from './ball.js';
import { createSparks, updateSparks, clearSparks, emitBounce, emitExplosionBurst, createDebris, emitDebrisExplosion, updateDebris } from './sparks.js';
import { updateCamera } from './camera.js';
import { updateHUD, applyFlash, applyDanger, endGame, showRespawnCountdown } from './ui.js';
import { createAudioSystem, AudioMetadataBus } from './audio/index.js';
import { createBackgroundLayer } from './procedural/shadders/background/background.glsl.js';
import { PostChain } from './postprocess/postChain.js';
import { DOFPass } from './postprocess/passes/dofPass.js';
import { FXAAPass } from './postprocess/passes/fxaaPass.js';
import { HuePass } from './postprocess/passes/huePass.js';
import { VignettePass } from './postprocess/passes/vignettePass.js';

function bitrev32(n) {
  n = n >>> 0;
  n = ((n & 0x55555555) << 1)  | ((n >>> 1)  & 0x55555555);
  n = ((n & 0x33333333) << 2)  | ((n >>> 2)  & 0x33333333);
  n = ((n & 0x0f0f0f0f) << 4)  | ((n >>> 4)  & 0x0f0f0f0f);
  n = ((n & 0x00ff00ff) << 8)  | ((n >>> 8)  & 0x00ff00ff);
  n = ((n << 16) | (n >>> 16)) >>> 0;
  return n;
}

const PROCEDURAL_DEBUG = false;
const PROCEDURAL_PLAYER = true;

const overlay  = document.getElementById('overlay');
const canvas   = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040c);
scene.fog        = new THREE.Fog(0x040816, 28, 220);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

// ---- Render targets + postprocessing (declare early to avoid TDZ) ----
let sceneColorRT = null;
let postChain = null;
let dofPass = null;
let fxaaPass = null;
let huePass = null;
let vignettePass = null;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();

  // Update render targets for postprocessing
  if (sceneColorRT) {
    sceneColorRT.setSize(w, h);
  }
  if (postChain) {
    postChain.resize(w, h);
  }
  if (dofPass) {
    dofPass.resize(w, h);
  }
  if (fxaaPass) {
    fxaaPass.resize(w, h);
  }
  if (huePass) {
    huePass.resize(w, h);
  }
}

resize();
window.addEventListener('resize', resize);

const backgroundLayer = createBackgroundLayer(scene);

// ---- Stage 2: Render-target pipeline for depth-aware particles and postprocessing ----
function createRenderTargets() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  sceneColorRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType),
  });

  console.log('Created render targets:', w, 'x', h);
}

createRenderTargets();

// ---- Tunnel ----
const {
  tunnel,
  tunnelMat,
  startTunnelOscillation,
  updateTunnelOscillation,
  resetTunnelOscillation,
} = createTunnel(scene);

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0x6090ff, 0x281410, 0.55));
scene.add(new THREE.PointLight(0x0080ff, 2.5, 40));

{
  const l = new THREE.PointLight(0xff4000, 1.8, 35);
  l.position.set(8, -8, 0);
  scene.add(l);
}

// ---- Stage 3: Postprocess chain ----
function initPostprocessing() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  postChain = new PostChain(renderer, w, h);

  // Create and add passes
  dofPass = new DOFPass(w, h, sceneColorRT.depthTexture);
  dofPass.setDOFParameters(
    state.dofFocalDistance,
    state.dofNearAmount,
    state.dofFarAmount,
    state.dofFocalRange,
    state.dofMaxRadius,
    camera.near,
    camera.far
  );
  postChain.addPass('dof_h', dofPass.getHorizontalMaterial());
  postChain.addPass('dof_v', dofPass.getVerticalMaterial());

  fxaaPass = new FXAAPass(w, h);
  postChain.addPass('fxaa', fxaaPass.getMaterial());

  huePass = new HuePass(w, h);
  postChain.addPass('hue', huePass.getMaterial());

  vignettePass = new VignettePass(w, h, state.vignetteRadius, state.vignetteIntensity);
  postChain.addPass('vignette', vignettePass.getMaterial());

  console.log('Postprocessing chain initialized');
}

initPostprocessing();

// ---- Ball / car ----
const ballObjects = createBall(scene);
const { carGroup } = ballObjects;

// ---- Audio system ----
const audioSystem = createAudioSystem();
audioSystem.bridge.register(tunnelMat);
audioSystem.bridge.register(backgroundLayer.material);

// ---- Sparks ----
createSparks(scene);
createDebris(scene);

// ---- Procedural track ----
const chunkManager = createDemoChunkManager(42);
const demoTrack = chunkManager.trackWorld;
let debugRenderer = null;
if (PROCEDURAL_DEBUG) {
  debugRenderer = new DebugTrackRenderer(demoTrack);
  debugRenderer.build(THREE);
  debugRenderer.addToScene(scene);
}

// Hide straight cylinder tunnel — using procedural InfiniteMesh instead
tunnel.visible = false;

// ---- New continuous tunnel (replaces chunk system in PROCEDURAL_PLAYER mode) ----
let infiniteSpline = null;
let infiniteMeshObj = null;
let crossSection = null;
function resetSpline() {
  infiniteSpline = createInfiniteSpline(bitrev32(Date.now()));
  infiniteSpline.extend(800);
  if (infiniteMeshObj) infiniteMeshObj.setSpline(infiniteSpline);
}

if (PROCEDURAL_PLAYER) {
  infiniteSpline = createInfiniteSpline(bitrev32(Date.now()));
  infiniteSpline.extend(800);
  crossSection = createCrossSection();
  infiniteMeshObj = new InfiniteMesh(scene, infiniteSpline, crossSection);
  audioSystem.bridge.register(infiniteMeshObj.material);
}

// ---- Flythrough state ----
let flythroughActive = false;
let flythroughS = 0;
let flythroughSurfaceId = null;
const FLYTHROUGH_SPEED = 55;
let latestGameplayFrame = null;

// ---- Input ----
setupInput();

// ---- Game flow ----
function startGame(spawnS = 0) {
  state.carTheta = 0;
  state.thetaVelocity = 0;

  state.cameraTheta = 0;
  state.cameraThetaVelocity = 0;

  state.carZ = 0;

  state.radialOffset = 0;
  state.radialVelocity = 0;
  state.grounded = true;

  state.landingEvaluated = false;
  state.physicsForce = 0;

  state.crashed = false;
  state.crashTimer = 0;

  state.tumbleRollAngle = 0;
  state.tumblePitchAngle = 0;
  state.tumbleRollVelocity = 0;
  state.tumblePitchVelocity = 0;

  state.speed = BASE_SPEED_START;
  state.boost = 1;
  state.boostActive = false;

  state.score = 0;
  state.timeLeft = 120;
  state.timeElapsed = 0;

  state.flashAlpha = 0;
  state.totalDistance = 0;
  state.dangerTimer = 0;

  state.cameraFovCurrent = 66;
  state.cameraBackDistanceCurrent = 9;
  state.cameraHeightCurrent = 4.0;

  state.restitutionCurrent = BALL_PHYS.restitution;
  state.materialDamp = 1.0;

  state.jumpCooldown = 0;
  state.ballSpinAngle = 0;
  state.squashTimer = 0;
  state.frameCount = 0;

  resetTunnelOscillation();

  input.left = false;
  input.right = false;
  input.up = false;
  input.down = false;
  input.boost = false;
  input.jumpConsumed = false;

  if (PROCEDURAL_PLAYER) {
    initPlayerSurface(infiniteSpline, crossSection, spawnS);
    initPlayerSurfaceBasis(infiniteSpline, crossSection);
  }

  for (const o of state.obstacles) {
    scene.remove(o);

    o.traverse(c => {
      if (c.geometry) {
        c.geometry.dispose();
      }

      if (c.material) {
        c.material.dispose();
      }
    });
  }

  state.obstacles.length = 0;
  clearSparks();

  overlay.style.display = 'none';
  state.gameRunning = true;
}

function tick(dt) {
  if (PROCEDURAL_PLAYER) {
    updatePlayerSurface(dt, input.left, input.right, input.jumpConsumed, input.boost);
    if (input.jumpConsumed) input.jumpConsumed = false;

    const frame = getPlayerFrame();
    latestGameplayFrame = frame;
    // Set ball position FIRST so wake ribbon captures correct position
    updateBallPositionFromFrame(carGroup, frame);
    // Then visuals (ribbon uses carGroup.position + frame.right)
    updateCarVisuals(dt, ballObjects, renderer, scene, frame, audioSystem.isActive);
    updateSparks(dt);
    updateDebris(dt);

    state.dangerTimer = state.outOfBounds ? state.outOfBoundsTimer : 0;

    // ── Out-of-bounds: immediate big explosion → 3 sec respawn ──
    if (state.outOfBounds && state.outOfBoundsTimer >= OUT_OF_BOUNDS_KILL_S && !state._gameOverFired) {
      state._gameOverFired = true;
      state.respawning     = true;
      state.respawnTimer   = DEATH_BLAST_DURATION_S;
      state.edgeHeat       = 0;
      showRespawnCountdown(DEATH_BLAST_DURATION_S);

      const inertiaDir = frame
        ? frame.forward.clone()
        : new THREE.Vector3(0, 0, 1);
      const blastDir = inertiaDir.clone();
      if (blastDir.lengthSq() <= 1e-6) {
        blastDir.set(0, 0, 1);
      }
      blastDir.normalize();

      ballObjects._deathBlastActive = true;
      ballObjects._deathBlastTime = 0;
      ballObjects._deathBlastStartPos = ballObjects.carGroup.position.clone();
      ballObjects._deathBlastDir = blastDir;
      ballObjects._deathBlastSpeed = (state.sVelocity ?? state.speed) * 2.5;

      // 2.5x speed multiplier for a much bigger explosion
      const bigSpeed = (state.sVelocity ?? state.speed) * 2.5;
      emitExplosionBurst(ballObjects.carGroup.position, inertiaDir, bigSpeed);
      emitDebrisExplosion(ballObjects.carGroup.position, inertiaDir, bigSpeed);
      window.dispatchEvent(new CustomEvent('onGameOver', {
        detail: { position: ballObjects.carGroup.position.clone(), score: state.score }
      }));
    }

    // ── Respawn countdown ──
    if (state.respawning) {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) {
        state.respawning     = false;
        state._gameOverFired = false;
        state.edgeHeat       = 0;
        state.outOfBounds    = false;
        state.outOfBoundsTimer = 0;
        ballObjects._heatLerp          = 0;
        ballObjects._miniBurstCooldown = 0;
        ballObjects._deathBlastActive = false;
        ballObjects._deathBlastTime = 0;
        ballObjects._deathBlastStartPos = null;
        ballObjects._deathBlastDir = null;
        ballObjects._deathBlastSpeed = 0;
        // Recreate spline from scratch — old one was trimmed and has no data at s=0
        resetSpline();
        // Full game restart from scratch — audio stays as-is
        startGame(RESTART_SPAWN_M);
        ballObjects.carGroup.visible = true;
      }
    }

    if (state.gameRunning && !state.crashed) {
      // No danger/game-over detection in procedural mode
      state.score += state.sVelocity * dt * 0.18;
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHUD();
        endGame(false, () => startGame(RESTART_SPAWN_M));
        return;
      }
      updateHUD();
    }

    applyFlash(dt);
    applyDanger();
    updateCamera(dt, camera, carGroup, frame);

    if (infiniteMeshObj) {
      if (crossSection) {
        const arcSpan   = crossSection.getArcSpan(state.s);
        const uHalf     = arcSpan * Math.PI;           // radians per half-arc
        const totalArcM = 2.0 * uHalf * 8.5;          // metres (8.5 = hardcoded R in playerSurface)
        const heatFrac  = totalArcM > 0.001 ? EDGE_HEAT_ZONE_M / totalArcM : 0;
        infiniteMeshObj.setHeatZone(heatFrac, state.edgeHeat ?? 0);
      }
      infiniteMeshObj.update(state.s, frame ? frame.position : new THREE.Vector3(), dt);
    }

    return;
  }
}

// ---- Flythrough helpers ----
function getSafeTrackUAt(seg, localS) {
  const track = seg.safeTracks[0];
  if (!track || track.samples.length === 0) return 0;
  const progress = Math.max(0, Math.min(1, localS / seg.length));
  const rawIdx = progress * (track.samples.length - 1);
  const idx = Math.floor(rawIdx);
  const next = Math.min(track.samples.length - 1, idx + 1);
  const localT = rawIdx - idx;
  return track.samples[idx].u + (track.samples[next].u - track.samples[idx].u) * localT;
}

function updateFlythroughCamera(dt) {
  // Initialize surface id
  if (!flythroughSurfaceId) {
    flythroughSurfaceId = chunkManager.getFirstSegmentId();
    flythroughS = 0;
  }

  flythroughS += FLYTHROUGH_SPEED * dt;

  // Advance to next segment if needed
  const segLen = chunkManager.getSegmentLength(flythroughSurfaceId);
  if (flythroughS >= segLen) {
    const nextId = chunkManager.advanceToNextSegment(flythroughSurfaceId);
    if (nextId) {
      flythroughS -= segLen;
      flythroughSurfaceId = nextId;
      chunkManager.update(flythroughSurfaceId, flythroughS);
    } else {
      flythroughS = segLen - 0.1;
    }
  }

  const seg = demoTrack.surfaces.find(s => s.id === flythroughSurfaceId);
  if (!seg) return;

  const trackU = getSafeTrackUAt(seg, flythroughS);
  const frame = demoTrack.getFrame(flythroughSurfaceId, flythroughS, trackU, 3);
  if (!frame) return;

  camera.position.copy(frame.position);
  camera.up.copy(frame.normal);
  const lookTarget = frame.position.clone().addScaledVector(frame.forward, 20);
  camera.lookAt(lookTarget);

  // Update meshes during flythrough too
  if (tunnelMeshManager) {
    tunnelMeshManager.update(demoTrack.surfaces, chunkManager, dt, 0, new THREE.Vector3());
  }
}

function startFlythrough() {
  flythroughActive = true;
  flythroughS = 0;
  flythroughSurfaceId = null;
  overlay.style.display = 'none';
  carGroup.visible = false;
  camera.fov = 85;
  camera.updateProjectionMatrix();
  if (debugRenderer) debugRenderer.setVisible(true);
}

function stopFlythrough() {
  flythroughActive = false;
  carGroup.visible = true;
  camera.fov = 66;
  camera.updateProjectionMatrix();
  if (debugRenderer) debugRenderer.setVisible(PROCEDURAL_DEBUG);
  overlay.style.display = '';
}

// ---- Main loop ----
let lastT = performance.now();

function updatePostprocessPasses() {
  if (!postChain) return;

  // Update DOF passes
  const hasDOFH = postChain.passes.find(p => p.name === 'dof_h');
  if (state.enableDOF && !hasDOFH) {
    if (dofPass) {
      dofPass.setDOFParameters(
        state.dofFocalDistance,
        state.dofNearAmount,
        state.dofFarAmount,
        state.dofFocalRange,
        state.dofMaxRadius,
        camera.near,
        camera.far
      );
      postChain.addPass('dof_h', dofPass.getHorizontalMaterial());
      postChain.addPass('dof_v', dofPass.getVerticalMaterial());
    }
  } else if (!state.enableDOF && hasDOFH) {
    postChain.removePass('dof_h');
    postChain.removePass('dof_v');
  } else if (state.enableDOF && hasDOFH && dofPass) {
    // Update DOF parameters if already enabled
    dofPass.setDOFParameters(
      state.dofFocalDistance,
      state.dofNearAmount,
      state.dofFarAmount,
      state.dofFocalRange,
      state.dofMaxRadius,
      camera.near,
      camera.far
    );
  }

  // Update FXAA pass
  const hasFXAA = postChain.passes.find(p => p.name === 'fxaa');
  if (state.enableFXAA && !hasFXAA && fxaaPass) {
    postChain.addPass('fxaa', fxaaPass.getMaterial());
  } else if (!state.enableFXAA && hasFXAA) {
    postChain.removePass('fxaa');
  }

  // Update Vignette pass
  const hasVignette = postChain.passes.find(p => p.name === 'vignette');
  if (state.enableVignette && !hasVignette && vignettePass) {
    vignettePass.setVignetteParameters(state.vignetteRadius, state.vignetteIntensity);
    postChain.addPass('vignette', vignettePass.getMaterial());
  } else if (!state.enableVignette && hasVignette) {
    postChain.removePass('vignette');
  } else if (state.enableVignette && hasVignette && vignettePass) {
    // Update vignette parameters if already enabled
    vignettePass.setVignetteParameters(state.vignetteRadius, state.vignetteIntensity);
  }
}

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  const elapsedTime = t / 1000;
  const postTime = performance.now() * 0.001;

  lastT = t;

  if (huePass) {
    huePass.update(postTime);
  }

  if (flythroughActive) {
    updateFlythroughCamera(dt);
    audioSystem.tick(dt);
    backgroundLayer.update(elapsedTime, camera);
    tunnelMat.uniforms.time.value    = elapsedTime;
    tunnelMat.uniforms.playerZ.value = flythroughS;
    tunnel.position.z                = flythroughS;

    // Stage 2: Render scene to render target
    renderer.setRenderTarget(sceneColorRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Stage 3: Apply postprocessing if enabled
    if (state.postEnabled && postChain) {
      postChain.execute(sceneColorRT);
    } else if (postChain) {
      // Fallback: reusable blit (no per-frame allocation)
      postChain.blitFallback(sceneColorRT);
    }

    requestAnimationFrame(loop);
    return;
  }

  tick(dt);

  audioSystem.tick(dt);
  backgroundLayer.update(elapsedTime, camera);

  // Update BPM display
  const audioFrame = AudioMetadataBus.current;
  if (audioFrame && audioFrame.bpm) {
    const bpmEl = document.getElementById('audio-bpm');
    if (bpmEl) bpmEl.textContent = Math.round(audioFrame.bpm) + ' BPM';
  }

  tunnelMat.uniforms.time.value = elapsedTime;

  // Update postprocess passes based on state
  updatePostprocessPasses();

  // Stage 2: Render scene to render target
  renderer.setRenderTarget(sceneColorRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Stage 3: Apply postprocessing if enabled
  if (state.postEnabled && postChain) {
    postChain.execute(sceneColorRT);
  } else if (postChain) {
    // Fallback: reusable blit (no per-frame allocation)
    postChain.blitFallback(sceneColorRT);
  }

  requestAnimationFrame(loop);
}

// ---- UI wiring ----
document.getElementById('start-btn').addEventListener('click', () => startGame(0));
document.getElementById('flythrough-btn').addEventListener('click', startFlythrough);
const hudRestartBtn = document.getElementById('hud-restart-btn');
if (hudRestartBtn) hudRestartBtn.addEventListener('click', () => startGame(RESTART_SPAWN_M));

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && flythroughActive) stopFlythrough();
});

document.getElementById('open-spotify-btn').addEventListener('click', () => {
  const url = document.getElementById('spotify-input').value.trim();
  if (url) window.open(url, '_blank');
});

document.getElementById('audio-btn').addEventListener('click', async () => {
  if (audioSystem.isActive) {
    audioSystem.stopCapture();
    const statusEl = document.getElementById('audio-status');
    if (statusEl) statusEl.style.display = 'none';
    return;
  }
  try {
    await audioSystem.startCapture();
    const statusEl = document.getElementById('audio-status');
    if (statusEl) statusEl.style.display = 'block';
  } catch (e) {
    console.warn('Audio capture failed:', e.message);
  }
});

document.getElementById('mode-btn').addEventListener('click', () => {
  state.physicsMode = !state.physicsMode;

  const btn = document.getElementById('mode-btn');

  btn.textContent = state.physicsMode ? 'PHYSICS MODE' : 'CLASSIC MODE';
  btn.style.background = state.physicsMode ? '#ff8800' : '';
  btn.style.color = state.physicsMode ? '#0a0400' : '';

  document.getElementById('mode-indicator').textContent = state.physicsMode ? 'PHYSICS' : '';
});

{
  const btn = document.getElementById('mode-btn');

  btn.textContent = 'PHYSICS MODE';
  btn.style.background = '#ff8800';
  btn.style.color = '#0a0400';

  document.getElementById('mode-indicator').textContent = 'PHYSICS';
}

requestAnimationFrame(loop);