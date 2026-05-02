import * as THREE from 'three';
import { CFG, BALL_PHYS } from './config.js';
import { state } from './state.js';
import { input } from './input.js';
import { showTrick } from './ui.js';

// Prędkość docelowa na podstawie inputu (brak auto-przyspieszenia)
function targetBaseSpeed() {
  if (input.up)   return CFG.forwardSpeed;
  if (input.down) return CFG.minSpeed;
  return CFG.baseSpeed;
}

function evaluateLanding() {
  state.grounded = true;
}

function respawnAfterCrash() {
  state.carZ              += 18;
  state.carTheta           = 0;
  state.thetaVelocity      = 0;
  state.radialOffset       = 0;
  state.radialVelocity     = 0;
  state.grounded           = true;
  state.crashed            = false;
  state.crashTimer         = 0;
  state.tumbleRollAngle    = 0;
  state.tumblePitchAngle   = 0;
  state.tumbleRollVelocity  = 0;
  state.tumblePitchVelocity = 0;
  showTrick('RESPAWN');
}

export function updatePhysics(dt, left, right, jumpPressed, boostHeld) {
  if (state.crashed) {
    state.crashTimer    -= dt;
    state.speed         += (CFG.baseSpeed * 0.4 - state.speed) * 5 * dt;
    state.carZ          += state.speed * dt;
    state.totalDistance += state.speed * dt;
    state.timeElapsed   += dt;
    state.carTheta      += state.thetaVelocity * 0.3 * dt;
    state.thetaVelocity *= Math.exp(-5 * dt);
    state.tumbleRollAngle  += state.tumbleRollVelocity  * dt;
    state.tumblePitchAngle += state.tumblePitchVelocity * dt;
    const tw = Math.PI * 2;
    state.carTheta = ((state.carTheta % tw) + tw) % tw;
    if (state.crashTimer <= 0) respawnAfterCrash();
    return;
  }

  const targetSpeed = boostHeld && state.boost > 0.02
    ? CFG.boostSpeed
    : targetBaseSpeed();
  state.speed += (targetSpeed - state.speed) * CFG.acceleration * dt;

  if (boostHeld && state.boost > 0.02) {
    state.boost       = Math.max(0, state.boost - CFG.boostDrain * dt);
    state.boostActive = true;
  } else {
    state.boost       = Math.min(1, state.boost + CFG.boostRegen * dt);
    state.boostActive = false;
  }

  const dz = state.speed * dt;
  state.carZ          += dz;
  state.totalDistance += dz;
  state.timeElapsed   += dt;

  const rawSteer = (left ? 1 : 0) - (right ? 1 : 0);
  const hasInput = rawSteer !== 0;

  state.physicsForce = rawSteer;
  const lateralFriction = hasInput ? 0 : BALL_PHYS.inertiaDecay;

  state.thetaVelocity += state.physicsForce * CFG.steerAcceleration * dt;
  state.thetaVelocity  = THREE.MathUtils.clamp(
    state.thetaVelocity, -CFG.maxThetaVelocity, CFG.maxThetaVelocity
  );
  state.thetaVelocity *= Math.exp(-lateralFriction * dt);
  state.carTheta      += state.thetaVelocity * dt;

  // S/↓ held: lerp restitution + materialDamp toward 0 (absorb / pure rolling)
  const absorb = input.down;
  state.restitutionCurrent += ((absorb ? 0 : BALL_PHYS.restitution) - state.restitutionCurrent)
    * Math.min(1, 4 * dt);
  state.materialDamp       += ((absorb ? 0 : 1) - state.materialDamp)
    * Math.min(1, 4 * dt);

  if (state.jumpCooldown > 0) state.jumpCooldown -= dt;

  if (jumpPressed && !state.crashed && state.jumpCooldown <= 0) {
    state.radialVelocity   = Math.max(state.radialVelocity, 0) + CFG.jumpImpulse;
    state.grounded         = false;
    state.landingEvaluated = false;
    state.jumpCooldown     = 2.0;
  }

  if (!state.grounded) {
    state.radialVelocity -= CFG.tunnelGravity * dt;

    // Near-wall micro-bounce damping
    if (state.radialVelocity < 0 && state.radialOffset < BALL_PHYS.surfaceDampRadius) {
      state.radialVelocity *= Math.exp(-BALL_PHYS.surfaceDamp * dt);
    }

    state.radialOffset += state.radialVelocity * dt;

    if (state.radialOffset > CFG.maxRadialOffset) {
      state.radialOffset   = CFG.maxRadialOffset;
      state.radialVelocity = Math.min(0, state.radialVelocity);
    }

    if (state.radialOffset <= 0) {
      const impact       = -state.radialVelocity;
      state.radialOffset = 0;
      // squashTimer scaled by materialDamp — no deform when absorbing
      state.squashTimer  = BALL_PHYS.squashDuration * state.materialDamp;

      if (!state.landingEvaluated) {
        evaluateLanding();
        state.landingEvaluated = true;
      }

      if (!state.crashed && impact * state.restitutionCurrent > BALL_PHYS.bounceThreshold) {
        state.radialVelocity = impact * state.restitutionCurrent;
        state.grounded       = false;
        state.bounceImpact   = impact;   // triggers spark emission in ball.js
      } else {
        state.radialVelocity = 0;
        state.grounded       = true;
      }
    }
  }

  const tw = Math.PI * 2;
  state.carTheta = ((state.carTheta % tw) + tw) % tw;
}
