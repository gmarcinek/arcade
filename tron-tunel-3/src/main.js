import * as THREE from 'three';
import { BALL_PHYS, BASE_SPEED_START, DANGER_TIMEOUT } from './config.js';
import { state } from './state.js';
import { input, setupInput } from './input.js';
import { createTunnel, getArcHalfAngle } from './tunnel.js';
import { createBall, updateCarVisuals } from './ball.js';
import { createSparks, updateSparks, clearSparks } from './sparks.js';
import { updatePhysics } from './physics.js';
import { updateCamera } from './camera.js';
import { updateHUD, applyFlash, applyDanger, showTrick, endGame } from './ui.js';

const overlay  = document.getElementById('overlay');
const canvas   = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040c);
scene.fog        = new THREE.Fog(0x040816, 28, 220);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ---- Tunnel ----
const { tunnel, tunnelMat } = createTunnel(scene);

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0x6090ff, 0x281410, 0.55));
scene.add(new THREE.PointLight(0x0080ff, 2.5, 40));
{ const l = new THREE.PointLight(0xff4000, 1.8, 35); l.position.set(8, -8, 0); scene.add(l); }

// ---- Ball / car ----
const ballObjects = createBall(scene);
const { carGroup } = ballObjects;

// ---- Sparks ----
createSparks(scene);

// ---- Input ----
setupInput();

// ---- Game flow ----
function startGame() {
  state.carTheta = 0;  state.thetaVelocity = 0;
  state.cameraTheta = 0;  state.cameraThetaVelocity = 0;
  state.carZ = 0;
  state.radialOffset = 0;  state.radialVelocity = 0;  state.grounded = true;
  state.landingEvaluated = false;  state.physicsForce = 0;
  state.crashed = false;  state.crashTimer = 0;
  state.tumbleRollAngle = 0;  state.tumblePitchAngle = 0;
  state.tumbleRollVelocity = 0;  state.tumblePitchVelocity = 0;
  state.speed = BASE_SPEED_START;  state.boost = 1;  state.boostActive = false;
  state.score = 0;  state.timeLeft = 60;  state.timeElapsed = 0;
  state.flashAlpha = 0;  state.totalDistance = 0;  state.dangerTimer = 0;
  state.cameraFovCurrent = 66;  state.cameraBackDistanceCurrent = 9;  state.cameraHeightCurrent = 4.0;
  state.restitutionCurrent = BALL_PHYS.restitution;
  state.materialDamp = 1.0;
  state.jumpCooldown = 0;
  state.ballSpinAngle = 0;  state.squashTimer = 0;  state.frameCount = 0;

  input.left = false;  input.right = false;  input.up = false;
  input.down = false;  input.boost = false;  input.jumpConsumed = false;

  for (const o of state.obstacles) {
    scene.remove(o);
    o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  }
  state.obstacles.length = 0;
  clearSparks();

  overlay.style.display = 'none';
  state.gameRunning = true;
}

function tick(dt) {
  if (state.gameRunning && !state.crashed) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) { state.timeLeft = 0; endGame(false, startGame); return; }
  }

  updatePhysics(dt, input.left, input.right, input.jumpConsumed, input.boost);
  if (input.jumpConsumed) input.jumpConsumed = false;

  updateCarVisuals(dt, ballObjects, renderer, scene);
  updateSparks(dt);

  if (state.gameRunning && !state.crashed) {
    const tNorm = state.carTheta > Math.PI ? state.carTheta - Math.PI * 2 : state.carTheta;
    const arcH  = getArcHalfAngle(state.carZ);
    if (Math.abs(tNorm) > arcH) {
      state.dangerTimer += dt;
      if (state.dangerTimer >= DANGER_TIMEOUT) { endGame(true, startGame); return; }
    } else {
      state.dangerTimer = Math.max(0, state.dangerTimer - dt * 4);
    }
    state.score += state.speed * dt * 0.18;
    updateHUD();
  }

  applyFlash(dt);
  applyDanger();
  updateCamera(dt, camera, carGroup);
}

// ---- Main loop ----
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  tunnelMat.uniforms.time.value    = t / 1000;
  tunnelMat.uniforms.playerZ.value = state.carZ;
  tunnel.position.z                = state.carZ;

  tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---- UI wiring ----
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('mode-btn').addEventListener('click', () => {
  state.physicsMode    = !state.physicsMode;
  const btn            = document.getElementById('mode-btn');
  btn.textContent      = state.physicsMode ? 'PHYSICS MODE' : 'CLASSIC MODE';
  btn.style.background = state.physicsMode ? '#ff8800' : '';
  btn.style.color      = state.physicsMode ? '#0a0400' : '';
  document.getElementById('mode-indicator').textContent = state.physicsMode ? 'PHYSICS' : '';
});
{
  const btn            = document.getElementById('mode-btn');
  btn.textContent      = 'PHYSICS MODE';
  btn.style.background = '#ff8800';
  btn.style.color      = '#0a0400';
  document.getElementById('mode-indicator').textContent = 'PHYSICS';
}
requestAnimationFrame(loop);
