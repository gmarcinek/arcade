import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { CAR_GEOMETRY_CENTER_HEIGHT, CONFIG, CAMERA_PHYSICS } from "./config.js";
import {
  getAngleDistanceDegrees,
  getBasis,
  getRollLandingErrorDegrees,
  normalizeAngle,
  smoothstep,
} from "./math.js";

export function createPhysicsController(state, callbacks) {
  function triggerKickflip(direction) {
    if (
      state.grounded ||
      state.crashed ||
      state.trickUsed ||
      state.ceilingTransferActive ||
      state.radialOffset < 0.25
    ) {
      return;
    }

    if (state.doubleJumpUsed && isTransferDeadpointWindow()) {
      startCeilingTransferKickflip(direction);
      return;
    }

    if (state.doubleJumpUsed && state.radialVelocity < 0) {
      state.lastTrick = "FALLING: NORMAL KICKFLIP";
    } else if (state.doubleJumpUsed) {
      state.lastTrick = "NOT DEADPOINT: NORMAL KICKFLIP";
    }

    startBasicKickflip(direction);
  }

  function startBasicKickflip(direction) {
    state.trickUsed = true;
    state.transferLandingMode = false;
    state.trickActive = true;
    state.trickRollDirection = direction;
    state.trickRollAngle = 0;
    state.trickRollVelocity = direction * ((Math.PI * 2) / CONFIG.kickflipDuration);
    state.lastTrick = direction > 0 ? "KICKFLIP RIGHT" : "KICKFLIP LEFT";
    callbacks.showNote(state.lastTrick);
  }

  function isTransferDeadpointWindow() {
    if (
      !state.doubleJumpUsed ||
      state.trickUsed ||
      state.ceilingTransferActive ||
      state.radialVelocity < 0 ||
      state.radialOffset < CONFIG.transferDeadpointMinOffset
    ) {
      return false;
    }

    const timeToApexMs = (state.radialVelocity / CONFIG.tunnelGravity) * 1000;
    return timeToApexMs <= CONFIG.transferDeadpointWindowMs;
  }

  function startDoubleJump() {
    if (
      state.grounded ||
      state.crashed ||
      state.doubleJumpUsed ||
      state.radialOffset < 0.7
    ) {
      return false;
    }

    const elapsedSinceJumpMs = performance.now() - state.jumpStartedAtMs;

    if (elapsedSinceJumpMs > CONFIG.doubleJumpWindowMs) {
      state.lastTrick = `DOUBLE MISS ${Math.round(elapsedSinceJumpMs)}ms`;
      callbacks.showNote("DOUBLE WINDOW MISSED");
      return false;
    }

    state.doubleJumpUsed = true;
    state.doubleJumpStartedAtMs = performance.now();
    state.radialOffset = Math.max(state.radialOffset, CONFIG.doubleJumpMinOffset);
    state.radialVelocity = Math.max(state.radialVelocity, CONFIG.doubleJumpImpulse);
    state.combo += 1;
    state.lastTrick = "DOUBLE JUMP: WAIT DEADPOINT";
    callbacks.showNote("DOUBLE JUMP");

    return true;
  }

  function startCeilingTransferKickflip(direction) {
    state.ceilingTransferActive = true;
    state.ceilingTransferTime = 0;
    state.ceilingTransferStartTheta = state.theta;
    state.ceilingTransferTargetTheta = state.jumpTakeoffTheta + Math.PI;

    state.trickUsed = true;
    state.transferLandingMode = true;
    state.trickActive = true;
    state.trickRollDirection = direction;
    state.trickRollAngle = 0;
    state.trickRollVelocity =
      direction * ((Math.PI * 2) / CONFIG.ceilingTransferDuration);

    state.lastTrick =
      direction > 0
        ? "DOUBLE KICKFLIP RIGHT TRANSFER"
        : "DOUBLE KICKFLIP LEFT TRANSFER";

    callbacks.holdCameraTheta(CAMERA_PHYSICS.transferChaseDelayMs);
    callbacks.showNote("DOUBLE KICKFLIP → VERTICAL TRANSFER");

    return true;
  }

  function update(frameInput, dt) {
    dt = Math.min(dt, 1 / 30);

    if (state.crashed) {
      updateCrashPhysics(dt);
      return;
    }

    updateForwardMotion(frameInput, dt);
    updateSteering(frameInput, dt);
    updateJumpAndAir(frameInput, dt);

    state.theta = normalizeAngle(state.theta);
  }

  function updateForwardMotion(frameInput, dt) {
    const canBoost = frameInput.boostHeld && state.boost > 0.02;

    const throttleSpeedOffset =
      frameInput.throttle > 0
        ? CONFIG.forwardSpeedBonus
        : frameInput.throttle < 0
          ? -CONFIG.brakeSpeedPenalty
          : 0;

    const targetSpeed =
      (canBoost ? CONFIG.boostSpeed : CONFIG.baseSpeed) + throttleSpeedOffset;

    state.zVelocity += (targetSpeed - state.zVelocity) * CONFIG.acceleration * dt;
    state.z += state.zVelocity * dt;

    if (canBoost) {
      state.boost = Math.max(0, state.boost - CONFIG.boostDrain * dt);
    } else {
      state.boost = Math.min(1, state.boost + CONFIG.boostRegen * dt);
    }
  }

  function updateSteering(frameInput, dt) {
    const grip = state.grounded ? 1 : CONFIG.airControl;
    const friction = state.grounded ? CONFIG.groundedFriction : CONFIG.airFriction;

    state.thetaVelocity += frameInput.steer * CONFIG.steerAcceleration * grip * dt;

    state.thetaVelocity = THREE.MathUtils.clamp(
      state.thetaVelocity,
      -CONFIG.maxThetaVelocity,
      CONFIG.maxThetaVelocity
    );

    state.thetaVelocity *= Math.exp(-friction * dt);
    state.theta += state.thetaVelocity * dt;
  }

  function updateJumpAndAir(frameInput, dt) {
    if (frameInput.jumpPressed && state.grounded) {
      startJump();
    } else if (frameInput.jumpPressed && !state.grounded) {
      startDoubleJump();
    }

    if (!state.grounded) {
      updateCeilingTransfer(dt);
      updateTrickPhysics(dt);
      updateRadialPhysics(dt);
    }
  }

  function startJump() {
    state.radialVelocity = CONFIG.jumpImpulse;
    state.grounded = false;

    state.trickUsed = false;
    state.trickActive = false;
    state.trickRollAngle = 0;
    state.trickRollVelocity = 0;
    state.trickRollDirection = 0;

    state.doubleJumpUsed = false;
    state.ceilingTransferActive = false;
    state.ceilingTransferTime = 0;
    state.ceilingTransferStartTheta = state.theta;
    state.ceilingTransferTargetTheta = state.theta;
    state.transferLandingMode = false;

    state.jumpTakeoffTheta = state.theta;
    state.jumpStartedAtMs = performance.now();
    state.doubleJumpStartedAtMs = -Infinity;

    state.lastTrick = "AIR";
    callbacks.showNote("RADIAL JUMP");
  }

  function updateRadialPhysics(dt) {
    state.radialVelocity -= CONFIG.tunnelGravity * dt;
    state.radialOffset += state.radialVelocity * dt;

    if (state.radialOffset > CONFIG.maxRadialOffset) {
      state.radialOffset = CONFIG.maxRadialOffset;
      state.radialVelocity = Math.min(0, state.radialVelocity);
    }

    if (state.ceilingTransferActive && state.radialOffset <= 0) {
      state.radialOffset = 0.35;
      state.radialVelocity = 0;
      return;
    }

    if (state.radialOffset <= 0) {
      state.radialOffset = 0;
      state.radialVelocity = 0;
      evaluateLanding();
    }
  }

  function updateCeilingTransfer(dt) {
    if (!state.ceilingTransferActive) return;

    state.ceilingTransferTime += dt;

    const rawT = THREE.MathUtils.clamp(
      state.ceilingTransferTime / CONFIG.ceilingTransferDuration,
      0,
      1
    );

    const t = smoothstep(rawT);
    state.theta =
      state.ceilingTransferStartTheta +
      (state.ceilingTransferTargetTheta - state.ceilingTransferStartTheta) * t;

    if (rawT < 1) {
      const transferArcOffset = Math.sin(rawT * Math.PI) * CONFIG.maxRadialOffset;
      state.radialOffset = Math.max(state.radialOffset, transferArcOffset, 0.35);
    } else {
      state.ceilingTransferActive = false;
      state.theta = state.ceilingTransferTargetTheta;
      state.radialOffset = 0;
      state.radialVelocity = 0;
      state.lastTrick = state.trickActive ? "TRANSFER TOUCHDOWN" : "TRANSFER READY";
    }
  }

  function updateTrickPhysics(dt) {
    if (!state.trickActive) return;

    state.trickRollAngle += state.trickRollVelocity * dt;

    const target = state.trickRollDirection * Math.PI * 2;

    if (
      (state.trickRollDirection > 0 && state.trickRollAngle >= target) ||
      (state.trickRollDirection < 0 && state.trickRollAngle <= target)
    ) {
      state.trickRollAngle = target;
      state.trickRollVelocity = 0;
      state.trickActive = false;
      state.lastTrick = state.transferLandingMode
        ? "TRANSFER LANDING WINDOW"
        : "KICKFLIP READY";
    }
  }

  function evaluateLanding() {
    state.grounded = true;

    if (state.transferLandingMode) {
      evaluateTransferLanding();
      return;
    }

    if (!state.trickUsed) {
      state.trickRollAngle = 0;
      state.trickActive = false;
      state.lastTrick = "LANDING";
      callbacks.showNote("LANDING");
      return;
    }

    const errorDeg = getRollLandingErrorDegrees(state.trickRollAngle);

    if (errorDeg <= CONFIG.cleanLandingDegrees) {
      const points = 500 * state.combo;
      state.score += points;
      state.combo += 1;
      state.trickRollAngle = 0;
      state.trickActive = false;
      state.lastTrick = `CLEAN ${errorDeg.toFixed(1)}°`;
      callbacks.showNote(`CLEAN KICKFLIP +${points}`);
      return;
    }

    if (errorDeg <= CONFIG.hardLandingDegrees) {
      const points = 200 * state.combo;
      state.score += points;
      state.thetaVelocity += state.trickRollDirection * 1.25;
      state.zVelocity *= 0.82;
      state.trickRollAngle = 0;
      state.trickActive = false;
      state.lastTrick = `HARD ${errorDeg.toFixed(1)}°`;
      callbacks.showNote(`HARD LANDING +${points}`);
      return;
    }

    startCrash(errorDeg);
  }

  function evaluateTransferLanding() {
    const rollError = getRollLandingErrorDegrees(state.trickRollAngle);
    const thetaError = getAngleDistanceDegrees(
      state.theta,
      state.ceilingTransferTargetTheta
    );
    const errorDeg = Math.max(rollError, thetaError);

    if (errorDeg <= CONFIG.cleanLandingDegrees) {
      const points = 900 * state.combo;
      state.score += points;
      state.combo += 2;
      state.theta = state.ceilingTransferTargetTheta;
      state.trickRollAngle = 0;
      state.trickActive = false;
      state.transferLandingMode = false;
      state.lastTrick = `TRANSFER CLEAN ${errorDeg.toFixed(1)}°`;
      callbacks.showNote(`TRANSFER CLEAN +${points}`);
      return;
    }

    if (errorDeg <= CONFIG.hardLandingDegrees) {
      const points = 350 * state.combo;
      state.score += points;
      state.theta = state.ceilingTransferTargetTheta;
      state.thetaVelocity += state.trickRollDirection * 1.65;
      state.zVelocity *= 0.78;
      state.trickRollAngle = 0;
      state.trickActive = false;
      state.transferLandingMode = false;
      state.lastTrick = `TRANSFER HARD ${errorDeg.toFixed(1)}°`;
      callbacks.showNote(`TRANSFER HARD +${points}`);
      return;
    }

    startCrash(errorDeg);
  }

  function startCrash(errorDeg) {
    state.crashed = true;
    state.grounded = true;
    state.crashTimer = CONFIG.crashRespawnSeconds;
    state.combo = 1;
    state.lastTrick = `CRASH ${errorDeg.toFixed(1)}°`;

    state.tumbleRollAngle = state.trickRollAngle;
    state.tumblePitchAngle = 0;
    state.tumbleRollVelocity = state.trickRollDirection * 12;
    state.tumblePitchVelocity = 8;

    state.trickActive = false;
    state.transferLandingMode = false;
    state.trickRollVelocity = 0;

    callbacks.showNote(`CRASH ${errorDeg.toFixed(1)}°`);
  }

  function updateCrashPhysics(dt) {
    state.crashTimer -= dt;
    state.zVelocity += (CONFIG.baseSpeed * 0.35 - state.zVelocity) * 5 * dt;
    state.z += state.zVelocity * dt;

    state.theta += state.thetaVelocity * 0.3 * dt;
    state.thetaVelocity *= Math.exp(-5 * dt);

    state.tumbleRollAngle += state.tumbleRollVelocity * dt;
    state.tumblePitchAngle += state.tumblePitchVelocity * dt;

    if (state.crashTimer <= 0) {
      respawnAfterCrash();
    }

    state.theta = normalizeAngle(state.theta);
  }

  function respawnAfterCrash() {
    state.z += 18;
    state.theta = 0;
    state.zVelocity = CONFIG.baseSpeed;
    state.thetaVelocity = 0;

    state.radialOffset = 0;
    state.radialVelocity = 0;
    state.grounded = true;

    state.crashed = false;
    state.crashTimer = 0;

    state.trickUsed = false;
    state.trickActive = false;
    state.trickRollAngle = 0;
    state.trickRollVelocity = 0;
    state.trickRollDirection = 0;

    state.doubleJumpUsed = false;
    state.ceilingTransferActive = false;
    state.ceilingTransferTime = 0;
    state.ceilingTransferStartTheta = state.theta;
    state.ceilingTransferTargetTheta = state.theta;
    state.transferLandingMode = false;

    state.jumpTakeoffTheta = state.theta;
    state.jumpStartedAtMs = -Infinity;
    state.doubleJumpStartedAtMs = -Infinity;

    state.tumbleRollAngle = 0;
    state.tumblePitchAngle = 0;
    state.tumbleRollVelocity = 0;
    state.tumblePitchVelocity = 0;

    state.lastTrick = "RESPAWN";
    callbacks.showNote("RESPAWN");
  }

  function getCarTransform() {
    const { surfaceOut, up, right, forward } = getBasis(state.theta);
    const radius = CONFIG.tunnelRadius - state.radialOffset;
    const centerRadius = radius - CAR_GEOMETRY_CENTER_HEIGHT;

    const position = new THREE.Vector3(
      surfaceOut.x * centerRadius,
      surfaceOut.y * centerRadius,
      state.z
    );

    const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const visualQuaternion = quaternion.clone();

    if (state.crashed) {
      const roll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        state.tumbleRollAngle
      );
      const pitch = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        state.tumblePitchAngle
      );
      visualQuaternion.multiply(roll).multiply(pitch);
    } else if (state.trickUsed || Math.abs(state.trickRollAngle) > 0.001) {
      const roll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        state.trickRollAngle
      );
      visualQuaternion.multiply(roll);
    }

    return {
      position,
      quaternion: visualQuaternion,
      up,
      right,
      forward,
      surfaceOut,
    };
  }

  return {
    update,
    triggerKickflip,
    getCarTransform,
  };
}
