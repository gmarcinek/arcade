import * as THREE from 'three';
import { CFG, BALL_PHYS, BALL_R, TUNNEL_R, LANE_ANGLE } from './config.js';
import { state } from './state.js';
import { input } from './input.js';
import { showTrick } from './ui.js';


function evaluateLanding() {
  state.grounded = true;
}

function respawnAfterCrash() {
  state.carZ              += 18;
  state.carTheta           = 0;
  state.thetaVelocity      = 0;
  state.ballOmega          = 0;
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

  // Force-based forward speed — mirrors lateral steering physics
  // Boost: retains fast spring-snap (feels intentionally snappy)
  if (boostHeld && state.boost > 0.02) {
    state.speed += (CFG.boostSpeed - state.speed) * CFG.acceleration * dt;
    state.boost       = Math.max(0, state.boost - CFG.boostDrain * dt);
    state.boostActive = true;
  } else {
    state.boost       = Math.min(1, state.boost + CFG.boostRegen * dt);
    state.boostActive = false;
    // Newton: throttle/brake apply force; rolling friction pulls toward cruise speed
    const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    state.speed += throttle * CFG.speedForce * dt;
    state.speed += (CFG.baseSpeed - state.speed) * CFG.speedFriction * dt;
    state.speed  = THREE.MathUtils.clamp(state.speed, 0, CFG.forwardSpeed + 5);
  }

  const dz = state.speed * dt;
  state.carZ          += dz;
  state.totalDistance += dz;
  state.timeElapsed   += dt;

  const rawSteer = (right ? 1 : 0) - (left ? 1 : 0);
  state.physicsForce = rawSteer;

  // ── Rolling physics ──
  // Player applies torque to ball spin (like motorising the ball's own rotation).
  // Rolling friction then couples ball spin → tunnel position.
  // Sign: rawSteer > 0 = right → increasing carTheta → ball moves right (matches getBasis convention)
  const driveControl = state.grounded ? 1.0 : CFG.airControl;
  state.ballOmega += rawSteer * CFG.driveTorque * driveControl * dt;

  if (state.grounded) {
    // Rolling contact: slip = surface speed of ball minus contact point speed
    const v_spin    = state.ballOmega    * BALL_R;    // m/s — ball surface tangential
    const v_contact = state.thetaVelocity * TUNNEL_R; // m/s — wall contact speed
    const slip      = v_spin - v_contact;

    // Friction force (per unit mass, m/s²) — proportional, soft coupling
    const frictionAcc = CFG.rollingFriction * slip;

    // Friction drives tunnel angular velocity
    state.thetaVelocity += (frictionAcc / TUNNEL_R) * dt;

    // Friction reacts on ball spin: I_sphere = (2/5)*m*r², alpha = F*r/I = F/(0.4*r)
    state.ballOmega -= (frictionAcc / (0.4 * BALL_R)) * dt;
  } else {
    // In air: no friction — spin conserved (gyroscopic), lateral drifts slowly
    state.ballOmega     *= Math.exp(-CFG.spinDecay      * dt);
    state.thetaVelocity *= Math.exp(-CFG.airLateralDecay * dt);
  }

  // Lane-snap autopilot: soft pull toward nearest lane centre
  // laneError is signed angle offset from nearest lane centre, normalised to [-1, 1]
  if (CFG.tunnelAngularGravity > 0) {
    const halfLane  = LANE_ANGLE * 0.5;
    const local     = ((state.carTheta % LANE_ANGLE) + LANE_ANGLE) % LANE_ANGLE;
    const laneError = local < halfLane ? local : local - LANE_ANGLE;
    state.thetaVelocity -= CFG.tunnelAngularGravity * (laneError / halfLane) * dt;
  }

  // Hard velocity cap
  state.thetaVelocity = THREE.MathUtils.clamp(
    state.thetaVelocity, -CFG.maxThetaVelocity, CFG.maxThetaVelocity
  );
  const maxOmega = CFG.maxThetaVelocity * TUNNEL_R / BALL_R;
  state.ballOmega = THREE.MathUtils.clamp(state.ballOmega, -maxOmega, maxOmega);

  state.carTheta += state.thetaVelocity * dt;

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

      // Spin transfer: tangential velocity at impact imparts backspin/topspin to ball
      const v_tangential = state.thetaVelocity * TUNNEL_R;
      const spinGain     = v_tangential * CFG.bounceSpinTransfer / BALL_R;
      state.ballOmega   += spinGain;
      // Reaction: spin bleeds into lateral velocity
      state.thetaVelocity += state.ballOmega * BALL_R * CFG.bounceSpinTransfer / TUNNEL_R;

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
