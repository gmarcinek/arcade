import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {
  CAMERA_DISTANCE,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  CAMERA_PHYSICS,
  CONFIG,
} from "./config.js";

export function createCameraController(camera, state, input) {
  let cameraTheta = 0;
  let cameraThetaVelocity = 0;
  let cameraThetaHoldUntilMs = -Infinity;

  let cameraHeightCurrent = CAMERA_HEIGHT.normal;
  let cameraFovCurrent = CAMERA_FOV.normal;
  let cameraBackDistanceCurrent = CAMERA_DISTANCE.normal;

  function reset() {
    cameraTheta = 0;
    cameraThetaVelocity = 0;
    cameraThetaHoldUntilMs = -Infinity;
    cameraHeightCurrent = CAMERA_HEIGHT.normal;
    cameraFovCurrent = CAMERA_FOV.normal;
    cameraBackDistanceCurrent = CAMERA_DISTANCE.normal;
    camera.fov = cameraFovCurrent;
    camera.updateProjectionMatrix();
  }

  function holdTheta(ms) {
    cameraThetaHoldUntilMs = performance.now() + ms;
    cameraThetaVelocity = 0;
  }

  function update(carTransform, dt) {
    updateCameraThetaPhysics(dt);
    updateHeightAndFov(dt);
    updateDistance(dt);

    const cameraSurfaceOut = new THREE.Vector3(
      Math.sin(cameraTheta),
      -Math.cos(cameraTheta),
      0
    );

    const cameraUp = cameraSurfaceOut.clone().multiplyScalar(-1);

    const cameraRadius = CONFIG.tunnelRadius - cameraHeightCurrent;
    const lookAhead = 21;

    camera.position.set(
      cameraSurfaceOut.x * cameraRadius,
      cameraSurfaceOut.y * cameraRadius,
      state.z - cameraBackDistanceCurrent
    );

    camera.up.copy(cameraUp);

    camera.lookAt(
      carTransform.position.x,
      carTransform.position.y,
      state.z + lookAhead
    );
  }

  function updateCameraThetaPhysics(dt) {
    if (performance.now() < cameraThetaHoldUntilMs) {
      cameraThetaVelocity *= Math.exp(-12 * dt);
      return;
    }

    let delta = state.theta - cameraTheta;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const springForce = delta * CAMERA_PHYSICS.thetaSpring;
    const dampingForce = cameraThetaVelocity * CAMERA_PHYSICS.thetaDamping;

    cameraThetaVelocity += (springForce - dampingForce) * dt;

    cameraThetaVelocity = THREE.MathUtils.clamp(
      cameraThetaVelocity,
      -CAMERA_PHYSICS.maxThetaVelocity,
      CAMERA_PHYSICS.maxThetaVelocity
    );

    cameraTheta += cameraThetaVelocity * dt;

    const twoPi = Math.PI * 2;
    cameraTheta = ((cameraTheta % twoPi) + twoPi) % twoPi;
  }

  function updateHeightAndFov(dt) {
    const boostCameraActive = input.boost && state.boost > 0.02;

    const cameraHeightTarget = boostCameraActive
      ? CAMERA_HEIGHT.boost
      : CAMERA_HEIGHT.normal;

    const cameraHeightTransitionSeconds = boostCameraActive
      ? CAMERA_HEIGHT.enterSeconds
      : CAMERA_HEIGHT.exitSeconds;

    const cameraHeightSpeed =
      Math.abs(CAMERA_HEIGHT.normal - CAMERA_HEIGHT.boost) /
      cameraHeightTransitionSeconds;

    cameraHeightCurrent = moveToward(
      cameraHeightCurrent,
      cameraHeightTarget,
      cameraHeightSpeed * dt,
      Math.min(CAMERA_HEIGHT.normal, CAMERA_HEIGHT.boost),
      Math.max(CAMERA_HEIGHT.normal, CAMERA_HEIGHT.boost)
    );

    const cameraFovTarget = boostCameraActive ? CAMERA_FOV.boost : CAMERA_FOV.normal;

    const cameraFovTransitionSeconds = boostCameraActive
      ? CAMERA_FOV.enterSeconds
      : CAMERA_FOV.exitSeconds;

    const cameraFovSpeed =
      Math.abs(CAMERA_FOV.boost - CAMERA_FOV.normal) / cameraFovTransitionSeconds;

    cameraFovCurrent = moveToward(
      cameraFovCurrent,
      cameraFovTarget,
      cameraFovSpeed * dt,
      Math.min(CAMERA_FOV.normal, CAMERA_FOV.boost),
      Math.max(CAMERA_FOV.normal, CAMERA_FOV.boost)
    );

    if (Math.abs(camera.fov - cameraFovCurrent) > 0.01) {
      camera.fov = cameraFovCurrent;
      camera.updateProjectionMatrix();
    }
  }

  function updateDistance(dt) {
    const target = input.forward
      ? CAMERA_DISTANCE.forward
      : input.back
        ? CAMERA_DISTANCE.back
        : CAMERA_DISTANCE.normal;

    cameraBackDistanceCurrent +=
      (target - cameraBackDistanceCurrent) *
      (1 - Math.exp(-CAMERA_DISTANCE.lerpSpeed * dt));
  }

  function moveToward(current, target, step, minValue, maxValue) {
    if (Math.abs(target - current) <= step) return target;

    const next = current + Math.sign(target - current) * step;
    return THREE.MathUtils.clamp(next, minValue, maxValue);
  }

  return {
    reset,
    update,
    holdTheta,
  };
}
