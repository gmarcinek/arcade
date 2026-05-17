import * as THREE from 'three';
import {
  BALL_PHYS, BASE_SPEED_START, CFG,
  DEATH_BLAST_DURATION_S, EDGE_HEAT_ZONE_M,
  OUT_OF_BOUNDS_KILL_S, RESTART_SPAWN_M,
} from '../config.js';
import { scene, renderer, camera } from '../scene.js';
import { state }  from '../state.js';
import { input }  from '../input.js';
import {
  ballObjects, carGroup, audioSystem,
  infiniteSpline, infiniteMeshObj, crossSection,
  PROCEDURAL_PLAYER, resetSpline,
} from './world.js';
import { initPlayerSurface, updatePlayerSurface }    from '../procedural/playerSurface.js';
import { initPlayerSurfaceBasis, getPlayerFrame }    from '../procedural/playerSurfaceBasis.js';
import { updateCarVisuals, updateBallPositionFromFrame } from '../ball.js';
import {
  updateSparks, clearSparks,
  emitExplosionBurst, updateDebris, emitDebrisExplosion,
} from '../sparks.js';
import { updateCamera }                              from '../camera.js';
import {
  updateHUD, applyFlash, applyDanger,
  endGame, showRespawnCountdown,
} from '../hud/hud.js';
import { postTimelineMgr } from '../postprocess/manager.js';

const overlay = document.getElementById('overlay');

let _fireCooldown = 0;
export let latestGameplayFrame = null;

export function startGame(spawnS = 0) {
  if (postTimelineMgr) {
    postTimelineMgr.reset();
    postTimelineMgr.tick(0);
  }

  state.carTheta             = 0;
  state.thetaVelocity        = 0;
  state.cameraTheta          = 0;
  state.cameraThetaVelocity  = 0;
  state.carZ                 = 0;
  state.radialOffset         = 0;
  state.radialVelocity       = 0;
  state.grounded             = true;
  state.landingEvaluated     = false;
  state.physicsForce         = 0;
  state.crashed              = false;
  state.crashTimer           = 0;
  state.tumbleRollAngle      = 0;
  state.tumblePitchAngle     = 0;
  state.tumbleRollVelocity   = 0;
  state.tumblePitchVelocity  = 0;
  state.speed                = BASE_SPEED_START;
  state.boost                = 1;
  state.boostActive          = false;
  state.score                = 0;
  state.timeLeft             = 120;
  state.timeElapsed          = 0;
  state.flashAlpha           = 0;
  state.totalDistance        = 0;
  state.dangerTimer          = 0;
  state.cameraFovCurrent          = 66;
  state.cameraBackDistanceCurrent = 9;
  state.cameraHeightCurrent       = 4.0;
  state.restitutionCurrent  = BALL_PHYS.restitution;
  state.materialDamp        = 1.0;
  state.jumpCooldown        = 0;
  state.ballSpinAngle       = 0;
  state.squashTimer         = 0;
  state.frameCount          = 0;

  input.left          = false;
  input.right         = false;
  input.up            = false;
  input.down          = false;
  input.boost         = false;
  input.jumpConsumed  = false;

  if (PROCEDURAL_PLAYER) {
    initPlayerSurface(infiniteSpline, crossSection, spawnS);
    initPlayerSurfaceBasis(infiniteSpline, crossSection);
  }

  for (const o of state.obstacles) {
    scene.remove(o);
    o.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material)  c.material.dispose();
    });
  }
  state.obstacles.length = 0;
  clearSparks();

  overlay.style.display = 'none';
  state.gameRunning = true;
}

export function tick(dt) {
  if (!PROCEDURAL_PLAYER) return;

  // ── Charged jump ──
  if (input.jumpHeld && !state.crashed && state.jumpCooldown <= 0) {
    state.jumpChargeTime = Math.min(state.jumpChargeTime + dt, CFG.jumpChargeTime);
  }
  if (state.jumpCooldown > 0 || state.crashed) {
    state.jumpChargeTime = 0;
  }

  let jumpFiredPower = 0;
  if (input.jumpReleased) {
    input.jumpReleased = false;
    if (!state.crashed && state.jumpCooldown <= 0) {
      const t = Math.min(state.jumpChargeTime / CFG.jumpChargeTime, 1.0);
      jumpFiredPower = CFG.jumpMinFactor + (CFG.jumpMaxFactor - CFG.jumpMinFactor) * t;
    }
    state.jumpChargeTime = 0;
  }

  const _prevJumpCooldown = state.jumpCooldown;
  updatePlayerSurface(dt, input.left, input.right, jumpFiredPower, input.boost);

  if (state.jumpCooldown > _prevJumpCooldown && infiniteMeshObj) {
    infiniteMeshObj.triggerJumpWave(state.s, state.sVelocity, jumpFiredPower);
  }

  if (_fireCooldown > 0) _fireCooldown -= dt;
  if (input.fire) {
    input.fire = false;
    if (infiniteMeshObj && _fireCooldown <= 0) {
      infiniteMeshObj.triggerJumpWave(state.s, state.sVelocity);
      _fireCooldown = 3.0;
    }
  }

  const frame = getPlayerFrame();
  latestGameplayFrame = frame;
  updateBallPositionFromFrame(carGroup, frame);
  updateCarVisuals(dt, ballObjects, renderer, scene, frame, audioSystem.isActive);
  updateSparks(dt);
  updateDebris(dt);

  state.dangerTimer = state.outOfBounds ? state.outOfBoundsTimer : 0;

  // ── Out-of-bounds → big explosion → respawn ──
  if (state.outOfBounds && state.outOfBoundsTimer >= OUT_OF_BOUNDS_KILL_S && !state._gameOverFired) {
    state._gameOverFired = true;
    state.respawning     = true;
    state.respawnTimer   = DEATH_BLAST_DURATION_S;
    state.edgeHeat       = 0;
    showRespawnCountdown(DEATH_BLAST_DURATION_S);

    const inertiaDir = frame ? frame.forward.clone() : new THREE.Vector3(0, 0, 1);
    const blastDir   = inertiaDir.clone();
    if (blastDir.lengthSq() <= 1e-6) blastDir.set(0, 0, 1);
    blastDir.normalize();

    ballObjects._deathBlastActive   = true;
    ballObjects._deathBlastTime     = 0;
    ballObjects._deathBlastStartPos = ballObjects.carGroup.position.clone();
    ballObjects._deathBlastDir      = blastDir;
    ballObjects._deathBlastSpeed    = (state.sVelocity ?? state.speed) * 2.5;

    const bigSpeed = (state.sVelocity ?? state.speed) * 2.5;
    emitExplosionBurst(ballObjects.carGroup.position, inertiaDir, bigSpeed);
    emitDebrisExplosion(ballObjects.carGroup.position, inertiaDir, bigSpeed);
    window.dispatchEvent(new CustomEvent('onGameOver', {
      detail: { position: ballObjects.carGroup.position.clone(), score: state.score },
    }));
  }

  // ── Respawn countdown ──
  if (state.respawning) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.respawning              = false;
      state._gameOverFired          = false;
      state.edgeHeat                = 0;
      state.outOfBounds             = false;
      state.outOfBoundsTimer        = 0;
      ballObjects._heatLerp          = 0;
      ballObjects._miniBurstCooldown = 0;
      ballObjects._deathBlastActive  = false;
      ballObjects._deathBlastTime    = 0;
      ballObjects._deathBlastStartPos = null;
      ballObjects._deathBlastDir     = null;
      ballObjects._deathBlastSpeed   = 0;
      resetSpline();
      startGame(RESTART_SPAWN_M);
      ballObjects.carGroup.visible = true;
    }
  }

  if (state.gameRunning && !state.crashed) {
    state.score += state.sVelocity * dt * 0.18;
    updateHUD();
  }

  applyFlash(dt);
  applyDanger();
  updateCamera(dt, camera, carGroup, frame);

  if (infiniteMeshObj) {
    if (crossSection) {
      const arcSpan   = crossSection.getArcSpan(state.s);
      const uHalf     = arcSpan * Math.PI;
      const totalArcM = 2.0 * uHalf * 8.5;
      const heatFrac  = totalArcM > 0.001 ? EDGE_HEAT_ZONE_M / totalArcM : 0;
      infiniteMeshObj.setHeatZone(heatFrac, state.edgeHeat ?? 0);
    }
    infiniteMeshObj.update(state.s, frame ? frame.position : new THREE.Vector3(), dt);
  }
}
