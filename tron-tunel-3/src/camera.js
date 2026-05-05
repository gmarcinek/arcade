import * as THREE from 'three';
import {
  CAM_SPRING, CAM_DAMP, CAM_MAX_VEL,
  CAM_FOV_NORMAL, CAM_FOV_BOOST, CAM_FOV_ENTER_S, CAM_FOV_EXIT_S,
  CAM_HEIGHT_NORMAL, CAM_HEIGHT_BOOST,
  CAM_DIST_NORMAL, CAM_DIST_FORWARD, CAM_DIST_BACK,
  TUNNEL_R,
} from './config.js';
import { state } from './state.js';
import { input } from './input.js';
import { PROC_CFG } from './procedural/proceduralConfig.js';

// Constant-rate lerp — more predictable than exp lerp (from POC)
function moveToward(current, target, step) {
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

export function updateCamera(dt, camera, carGroup, proceduralFrame = null) {
  if (proceduralFrame) {
    const ballPos = proceduralFrame.position;

    // 1. Camera up: smoothed surface normal, projected ⊥ to forward
    let upTarget = proceduralFrame.normal.clone();
    upTarget.addScaledVector(proceduralFrame.forward, -upTarget.dot(proceduralFrame.forward));
    if (upTarget.lengthSq() < 0.001) upTarget.set(0, 1, 0);
    else upTarget.normalize();
    if (!state._camUp) state._camUp = upTarget.clone();
    state._camUp.lerp(upTarget, 1 - Math.exp(-dt / PROC_CFG.CAM_UP_TAU)).normalize();

    // 2. Look-ahead: weighted blend of track positions ahead → anticipates curves
    const rawLookAhead = proceduralFrame.lookAheadPos
      ? proceduralFrame.lookAheadPos.clone()
      : ballPos.clone().addScaledVector(proceduralFrame.forward, 20);
    if (!state._camLookAhead) state._camLookAhead = rawLookAhead.clone();
    state._camLookAhead.lerp(rawLookAhead, 1 - Math.exp(-dt / PROC_CFG.CAM_LOOKAHEAD_TAU));

    // 3. Camera placement: use spline forward (guaranteed correct direction)
    //    Camera goes BEHIND the ball along the spline tangent.
    const forward = proceduralFrame.forward.clone().normalize();

    // 4. Camera target: behind ball along spline forward, up from surface
    const radialOffset = state.radialOffset || 0.9;
    const height = PROC_CFG.CAM_HEIGHT + Math.max(0, (radialOffset - 0.9) * 0.6);
    let targetPos = ballPos.clone()
      .addScaledVector(forward, -PROC_CFG.CAM_BACK_DIST)
      .addScaledVector(state._camUp, height);

    // 5. Floor avoidance: keep camera above surface
    const surfPoint = ballPos.clone().addScaledVector(proceduralFrame.normal, -radialOffset);
    const camAboveSurf = targetPos.clone().sub(surfPoint).dot(state._camUp);
    if (camAboveSurf < PROC_CFG.CAM_FLOOR_MIN) {
      targetPos.addScaledVector(state._camUp, PROC_CFG.CAM_FLOOR_MIN - camAboveSurf);
    }

    // 6. Spring-damp camera position
    if (!state._camPos) state._camPos = targetPos.clone();
    state._camPos.lerp(targetPos, 1 - Math.exp(-dt / PROC_CFG.CAM_POS_TAU));
    camera.position.copy(state._camPos);

    // 7. Look at smoothed look-ahead (anticipates curves), up aligned to surface
    camera.up.copy(state._camUp);
    camera.lookAt(state._camLookAhead);

    // 8. FOV
    const fovTarget = state.boostActive ? CAM_FOV_BOOST : CAM_FOV_NORMAL;
    const fovTotalDelta = Math.abs(CAM_FOV_BOOST - CAM_FOV_NORMAL);
    const fovStep = (state.boostActive
      ? fovTotalDelta / CAM_FOV_ENTER_S
      : fovTotalDelta / CAM_FOV_EXIT_S) * dt;
    state.cameraFovCurrent = moveToward(state.cameraFovCurrent, fovTarget, fovStep);
    if (Math.abs(camera.fov - state.cameraFovCurrent) > 0.01) {
      camera.fov = state.cameraFovCurrent;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // Spring-damper on cameraTheta following carTheta
  let delta = state.carTheta - state.cameraTheta;
  const tw = Math.PI * 2;
  while (delta >  Math.PI) delta -= tw;
  while (delta < -Math.PI) delta += tw;

  const spring = delta * CAM_SPRING;
  const damp   = state.cameraThetaVelocity * CAM_DAMP;
  state.cameraThetaVelocity += (spring - damp) * dt;
  state.cameraThetaVelocity  = THREE.MathUtils.clamp(
    state.cameraThetaVelocity, -CAM_MAX_VEL, CAM_MAX_VEL
  );
  state.cameraTheta += state.cameraThetaVelocity * dt;
  state.cameraTheta  = ((state.cameraTheta % tw) + tw) % tw;

  // FOV: asymmetric — slow enter (dramatic), fast exit (snappy)
  const fovTarget     = state.boostActive ? CAM_FOV_BOOST : CAM_FOV_NORMAL;
  const fovTotalDelta = Math.abs(CAM_FOV_BOOST - CAM_FOV_NORMAL);
  const fovStep = (state.boostActive
    ? fovTotalDelta / CAM_FOV_ENTER_S
    : fovTotalDelta / CAM_FOV_EXIT_S) * dt;
  state.cameraFovCurrent = moveToward(state.cameraFovCurrent, fovTarget, fovStep);
  if (Math.abs(camera.fov - state.cameraFovCurrent) > 0.01) {
    camera.fov = state.cameraFovCurrent;
    camera.updateProjectionMatrix();
  }

  // Height: closer to wall during boost (tunnel feels larger/faster)
  const hTarget = state.boostActive ? CAM_HEIGHT_BOOST : CAM_HEIGHT_NORMAL;
  const hStep   = (Math.abs(CAM_HEIGHT_NORMAL - CAM_HEIGHT_BOOST) / 3.0) * dt;
  state.cameraHeightCurrent = moveToward(state.cameraHeightCurrent, hTarget, hStep);

  // Back-distance: ↑/W = gaz (kamera cofa), ↓/S = hamowanie (zoom in); lerp ~3s
  const distTarget = input.up ? CAM_DIST_FORWARD : input.down ? CAM_DIST_BACK : CAM_DIST_NORMAL;
  state.cameraBackDistanceCurrent +=
    (distTarget - state.cameraBackDistanceCurrent) * (1 - Math.exp(-0.5 * dt));

  const camSurf = new THREE.Vector3(Math.sin(state.cameraTheta), -Math.cos(state.cameraTheta), 0);
  const camUp   = camSurf.clone().multiplyScalar(-1);
  const camR    = TUNNEL_R - state.cameraHeightCurrent;

  camera.up.copy(camUp);
  camera.position.set(
    camSurf.x * camR,
    camSurf.y * camR,
    state.carZ - state.cameraBackDistanceCurrent,
  );
  camera.lookAt(carGroup.position.x, carGroup.position.y, state.carZ + 20);
}
