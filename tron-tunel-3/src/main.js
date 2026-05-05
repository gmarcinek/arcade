import * as THREE from 'three';
import { BALL_PHYS, BASE_SPEED_START, DANGER_TIMEOUT } from './config.js';
import { generateDemoTrack, createDemoChunkManager } from './procedural/generateDemoTrack.js';
import { DebugTrackRenderer } from './procedural/debugTrackRenderer.js';
import { createInfiniteSpline } from './procedural/infiniteSpline.js';
import { InfiniteMesh } from './procedural/infiniteMesh.js';
import { createCrossSection } from './procedural/crossSection.js';
import { initPlayerSurface, updatePlayerSurface } from './procedural/playerSurface.js';
import { initPlayerSurfaceBasis, getPlayerFrame } from './procedural/playerSurfaceBasis.js';
import { state } from './state.js';
import { input, setupInput } from './input.js';
import { createTunnel, getArcHalfAngle } from './tunnel.js';
import { createBall, updateCarVisuals, updateBallPositionFromFrame } from './ball.js';
import { createSparks, updateSparks, clearSparks } from './sparks.js';
import { updatePhysics } from './physics.js';
import { updateCamera } from './camera.js';
import { updateHUD, applyFlash, applyDanger, endGame } from './ui.js';
import { createAudioSystem, AudioMetadataBus } from './audio/index.js';

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

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

resize();
window.addEventListener('resize', resize);

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

// ---- Ball / car ----
const ballObjects = createBall(scene);
const { carGroup } = ballObjects;

// ---- Audio system ----
const audioSystem = createAudioSystem();
audioSystem.bridge.register(tunnelMat);

// ---- Sparks ----
createSparks(scene);

// ---- Procedural track ----
const chunkManager = createDemoChunkManager(42);
const demoTrack = chunkManager.trackWorld;
let debugRenderer = null;
if (PROCEDURAL_DEBUG) {
  debugRenderer = new DebugTrackRenderer(demoTrack);
  debugRenderer.build(THREE);
  debugRenderer.addToScene(scene);
}

// ---- Procedural tunnel mesh ----
const tunnelMeshManager = PROCEDURAL_PLAYER ? null : null;
// Hide old straight cylinder when in procedural mode
if (PROCEDURAL_PLAYER) {
  tunnel.visible = false;
}

// ---- New continuous tunnel (replaces chunk system in PROCEDURAL_PLAYER mode) ----
let infiniteSpline = null;
let infiniteMeshObj = null;
let crossSection = null;
if (PROCEDURAL_PLAYER) {
  infiniteSpline = createInfiniteSpline(Date.now() & 0xffffffff);
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

// ---- Input ----
setupInput();

// ---- Danger / black field trigger ----
let wasOnBlackField = false;

// ---- Game flow ----
function startGame() {
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
  state.timeLeft = 60;
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

  wasOnBlackField = false;
  resetTunnelOscillation();

  input.left = false;
  input.right = false;
  input.up = false;
  input.down = false;
  input.boost = false;
  input.jumpConsumed = false;

  if (PROCEDURAL_PLAYER) {
    initPlayerSurface(infiniteSpline, crossSection);
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
  if (!PROCEDURAL_PLAYER && state.gameRunning && !state.crashed) {
    state.timeLeft -= dt;

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame(false, startGame);
      return;
    }
  }

  if (PROCEDURAL_PLAYER) {
    updatePlayerSurface(dt, input.left, input.right, input.jumpConsumed, input.boost);
    if (input.jumpConsumed) input.jumpConsumed = false;

    const frame = getPlayerFrame();
    // Set ball position FIRST so wake ribbon captures correct position
    updateBallPositionFromFrame(carGroup, frame);
    // Then visuals (ribbon uses carGroup.position + frame.right)
    updateCarVisuals(dt, ballObjects, renderer, scene, frame);
    updateSparks(dt);

    if (state.gameRunning && !state.crashed) {
      // No danger/game-over detection in procedural mode
      state.score += state.sVelocity * dt * 0.18;
      updateHUD();
    }

    applyFlash(dt);
    applyDanger();
    updateCamera(dt, camera, carGroup, frame);

    if (infiniteMeshObj) {
      infiniteMeshObj.update(state.s, frame ? frame.position : new THREE.Vector3(), dt);
    }

    return;
  }

  // ---- Legacy path ----
  updatePhysics(
    dt,
    input.left,
    input.right,
    input.jumpConsumed,
    input.boost
  );

  if (input.jumpConsumed) {
    input.jumpConsumed = false;
  }

  updateCarVisuals(dt, ballObjects, renderer, scene);
  updateSparks(dt);

  if (state.gameRunning && !state.crashed) {
    const tNorm = state.carTheta > Math.PI
      ? state.carTheta - Math.PI * 2
      : state.carTheta;

    const arcH = getArcHalfAngle(state.carZ);

    const isOnBlackField = Math.abs(tNorm) > arcH;

    if (isOnBlackField && !wasOnBlackField) {
      startTunnelOscillation();
    }

    if (isOnBlackField) {
      state.dangerTimer += dt;

      if (state.dangerTimer >= DANGER_TIMEOUT) {
        endGame(true, startGame);
        return;
      }
    } else {
      state.dangerTimer = Math.max(0, state.dangerTimer - dt * 4);
    }

    wasOnBlackField = isOnBlackField;

    state.score += state.speed * dt * 0.18;
    updateHUD();
  }

  applyFlash(dt);
  applyDanger();
  updateCamera(dt, camera, carGroup);
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

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  const elapsedTime = t / 1000;

  lastT = t;

  if (flythroughActive) {
    updateFlythroughCamera(dt);
    audioSystem.tick(dt);
    tunnelMat.uniforms.time.value    = elapsedTime;
    tunnelMat.uniforms.playerZ.value = flythroughS;
    tunnel.position.z                = flythroughS;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
    return;
  }

  tick(dt);

  audioSystem.tick(dt);

  // Update BPM display
  const audioFrame = AudioMetadataBus.current;
  if (audioFrame && audioFrame.bpm) {
    const bpmEl = document.getElementById('audio-bpm');
    if (bpmEl) bpmEl.textContent = Math.round(audioFrame.bpm) + ' BPM';
  }

  tunnelMat.uniforms.time.value = elapsedTime;
  if (!PROCEDURAL_PLAYER) {
    tunnelMat.uniforms.playerZ.value     = state.carZ;
    tunnelMat.uniforms.playerTheta.value = state.carTheta;
    tunnelMat.uniforms.playerLift.value  = Math.max(0, state.radialOffset);
    tunnel.position.z = state.carZ;
  }

  if (!PROCEDURAL_PLAYER) updateTunnelOscillation(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---- UI wiring ----
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('flythrough-btn').addEventListener('click', startFlythrough);
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