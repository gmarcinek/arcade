import * as THREE from 'three';
import { CFG, BALL_PHYS, TUNNEL_R, PROC_CFG, EDGE_HEAT_ZONE_M, EDGE_HEAT_RATE, EDGE_HEAT_COOL, BOOST_HEAT_RATE, BOOST_HEAT_CUTOFF, BOOST_HEAT_REARM, BOOST_MIN_FUEL } from '../config.js';
import { state } from '../state.js';
import { input } from '../input.js';

const BALL_R = 0.9; // ball mesh radius — floor is at radialOffset = BALL_R

// Signed shortest-arc difference
function angleDiff(a, b) {
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // in (-PI, PI]
}

let _spline = null;
let _crossSection = null;

export function initPlayerSurface(spline, crossSection, startS = 0) {
  _spline = spline;
  _crossSection = crossSection;
  state.s          = Math.max(0, startS);
  state.u          = spline.getFloorU(state.s);
  state.uVelocity  = 0;
  state.sVelocity  = PROC_CFG.SPEED_BASE;
  state.radialOffset   = BALL_R;
  state.radialVelocity = 0;
  state.grounded   = true;
  state.landingEvaluated = false;
  state.jumpCooldown = 0;
  state.boost      = 1;
  state.boostActive = false;
}

// Exported for legacy compatibility (not used in new mode)
export function getFloorU(spline, s) {
  return spline ? spline.getFloorU(s) : Math.PI;
}

export function updatePlayerSurface(dt, left, right, jumpPressed, boostHeld) {
  if (!_spline) return;

  // Forward speed
  // Boost arming: re-arms only when fuel >= BOOST_MIN_FUEL AND heat is low
  if (!state.boostArmed && state.boost >= BOOST_MIN_FUEL && state.edgeHeat < BOOST_HEAT_REARM) {
    state.boostArmed = true;
  }
  // Force-disarm when heat kills boost
  if (state.edgeHeat >= BOOST_HEAT_CUTOFF) {
    state.boostArmed = false;
  }

  const canBoost = boostHeld && state.boostArmed && state.boost > 0.02 && state.edgeHeat < BOOST_HEAT_CUTOFF;
  if (canBoost) {
    state.sVelocity += (PROC_CFG.SPEED_BOOST - state.sVelocity) * CFG.acceleration * dt;
    state.boost = Math.max(0, state.boost - CFG.boostDrain * dt);
    state.boostActive = true;
    // Boost accumulates heat — engine running hot
    state.edgeHeat = Math.min(1, state.edgeHeat + BOOST_HEAT_RATE * dt);
    // Disarm when fuel depleted
    if (state.boost <= 0.02) state.boostArmed = false;
  } else {
    state.boost = Math.min(1, state.boost + CFG.boostRegen * dt);
    state.boostActive = false;
    const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    state.sVelocity += throttle * CFG.speedForce * dt;
    state.sVelocity += (PROC_CFG.SPEED_BASE - state.sVelocity) * CFG.speedFriction * dt;
    state.sVelocity = THREE.MathUtils.clamp(state.sVelocity, 0, PROC_CFG.SPEED_MAX);
  }

  const ds = state.sVelocity * dt;
  state.s          += ds;
  state.totalDistance += ds;
  state.timeElapsed   += dt;
  state.speed          = state.sVelocity;

  // Extend spline ahead, trim behind
  _spline.extend(state.s + 700);
  _spline.trim(state.s - 150);

  // ── Lateral physics — true inertia, surface-derived gravity ──
  // uVelocity = angular velocity (rad/s) on the tube cross-section.
  // Ball has mass: forces applied as angular accelerations.

  const GRAVITY_ACCEL   = 18.0;  // m/s² surface gravity magnitude (tunable)
  const STEER_ACCEL     = PROC_CFG.STEER_ACCELERATION; // rad/s² steering input
  const MAX_U_VEL       = PROC_CFG.MAX_U_VELOCITY;

  const rawSteer   = (left ? 1 : 0) - (right ? 1 : 0);
  const steerCtrl  = state.grounded ? 1 : CFG.airControl;

  // 1. Player steering input — direct angular acceleration
  state.uVelocity += rawSteer * STEER_ACCEL * steerCtrl * dt;

  // 2. Surface gravity: force is proportional to surface slope under ball.
  //    Get surface tangent at current u — its component along world-down is the slope force.
  //    This works for all κ: tube, flat, anti-tube automatically.
  const fAtBall = _spline.getFrameAt(state.s);
  if (fAtBall && _crossSection) {
    // Apply twist (arc span is visual only, radius = TUNNEL_R)
    const twistRot = _crossSection.getTwist(state.s) * Math.PI * 2;
    const cosT = Math.cos(twistRot), sinT = Math.sin(twistRot);
    const norT = new THREE.Vector3(
      fAtBall.nor.x * cosT + fAtBall.bin.x * sinT,
      fAtBall.nor.y * cosT + fAtBall.bin.y * sinT,
      fAtBall.nor.z * cosT + fAtBall.bin.z * sinT,
    );
    const binT = new THREE.Vector3(
      -fAtBall.nor.x * sinT + fAtBall.bin.x * cosT,
      -fAtBall.nor.y * sinT + fAtBall.bin.y * cosT,
      -fAtBall.nor.z * sinT + fAtBall.bin.z * cosT,
    );
    const { tx, ty } = _crossSection.getSurfaceTangent(state.u, state.s, TUNNEL_R);
    const tangWorld = new THREE.Vector3()
      .addScaledVector(norT, tx)
      .addScaledVector(binT, ty);
    const gravSlope = -tangWorld.y;
    state.uVelocity += (gravSlope * GRAVITY_ACCEL / TUNNEL_R) * dt;
  }

  // 3. Centrifugal force from spline curvature (tunnel bends push ball sideways)
  const fCurr = fAtBall;
  const fPrev = _spline.getFrameAt(state.s - 5);
  if (fCurr && fPrev) {
    const dtan = new THREE.Vector3().subVectors(fCurr.tan, fPrev.tan);
    const centrifugalWorld = dtan.clone().multiplyScalar(-(state.sVelocity * state.sVelocity) / 5);
    const cfx = centrifugalWorld.dot(fCurr.nor);
    const cfy = centrifugalWorld.dot(fCurr.bin);
    const ux = Math.cos(state.u), uy = Math.sin(state.u);
    const cfAngular = (-uy * cfx + ux * cfy) / TUNNEL_R;
    state.uVelocity += cfAngular * dt;
  }

  // 4. Friction/damping — always active; inertia is the primary force, player fights it
  state.uVelocity *= Math.exp(-BALL_PHYS.inertiaDecay * dt);
  state.uVelocity = THREE.MathUtils.clamp(state.uVelocity, -MAX_U_VEL, MAX_U_VEL);

  // 5. Integrate u — wrap only on closed shapes; open shapes let ball fly off edge freely
  const isOpen   = _crossSection && _crossSection.getIsOpen(state.s);
  // hasEdges: surface has real physical edges whenever arcSpan < 1.0 (independent of kappa)
  const arcSpan  = _crossSection ? _crossSection.getArcSpan(state.s) : 1.0;
  const hasEdges = arcSpan < 1.0;
  state.u += state.uVelocity * dt;

  // ── Edge proximity + out-of-bounds detection (open surfaces only) ──
  if (hasEdges && _crossSection) {
    const uHalf   = arcSpan * Math.PI;
    const uCenter = Math.PI;
    const uMin    = uCenter - uHalf;
    const uMax    = uCenter + uHalf;

    // distance from nearest edge in radians → convert to metres
    const distRad = Math.min(Math.abs(state.u - uMin), Math.abs(state.u - uMax));
    const distM   = distRad * /* TUNNEL_R */ 8.5;

    // edgeProximity: 0 safe (>EDGE_HEAT_ZONE_M), 1 at edge (<=0.05m)
    state.edgeProximity = THREE.MathUtils.clamp(
      (EDGE_HEAT_ZONE_M - distM) / (EDGE_HEAT_ZONE_M - 0.05), 0, 1
    );

    // Heat accumulates when in edge zone, cools when safe
    if (state.edgeProximity > 0) {
      state.edgeHeat = Math.min(1, state.edgeHeat + EDGE_HEAT_RATE * dt);
    } else {
      state.edgeHeat = Math.max(0, state.edgeHeat - EDGE_HEAT_COOL * dt);
    }

    // Out of bounds: u outside arc
    state.outOfBounds = state.u < uMin - 0.05 || state.u > uMax + 0.05;
    if (state.outOfBounds) {
      state.outOfBoundsTimer += dt;
    } else {
      state.outOfBoundsTimer = 0;
    }
  } else {
    state.edgeProximity  = 0;
    state.edgeHeat       = Math.max(0, state.edgeHeat - EDGE_HEAT_COOL * dt);
    state.outOfBounds    = false;
    state.outOfBoundsTimer = 0;
  }

  if (!isOpen) {
    const tw = Math.PI * 2;
    state.u = ((state.u % tw) + tw) % tw;
  }

  // Radial physics (jump/gravity/bounce — same as physics.js)
  const effBallR = BALL_R * (state.ballHeatScale ?? 1.0);
  // When grounded, lift the ball centre with the swelling radius so it hovers above the track
  if (state.grounded) state.radialOffset = effBallR;
  if (state.jumpCooldown > 0) state.jumpCooldown -= dt;
  if (jumpPressed && state.jumpCooldown <= 0 && !state.crashed) {
    state.radialVelocity = Math.max(state.radialVelocity, 0) + CFG.jumpImpulse;
    state.grounded       = false;
    state.landingEvaluated = false;
    state.jumpCooldown   = 2.0;
  }

  if (!state.grounded) {
    state.radialVelocity -= CFG.tunnelGravity * dt;
    if (state.radialVelocity < 0 && state.radialOffset < effBallR + BALL_PHYS.surfaceDampRadius) {
      state.radialVelocity *= Math.exp(-BALL_PHYS.surfaceDamp * dt);
    }
    state.radialOffset += state.radialVelocity * dt;
    if (state.radialOffset > CFG.maxRadialOffset) {
      state.radialOffset   = CFG.maxRadialOffset;
      state.radialVelocity = Math.min(0, state.radialVelocity);
    }
    if (state.radialOffset <= effBallR) {
      state.radialOffset = effBallR;
      state.squashTimer  = BALL_PHYS.squashDuration * state.materialDamp;
      if (!state.landingEvaluated) {
        state.grounded = true;
        state.landingEvaluated = true;
      }
      const impact = -state.radialVelocity;
      if (!state.crashed && impact * state.restitutionCurrent > BALL_PHYS.bounceThreshold) {
        state.radialVelocity = impact * state.restitutionCurrent;
        state.grounded       = false;
        state.bounceImpact   = impact;
      } else {
        state.radialVelocity = 0;
        state.grounded       = true;
      }
    }
  }
}
