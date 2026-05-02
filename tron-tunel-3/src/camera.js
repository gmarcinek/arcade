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

// Constant-rate lerp — more predictable than exp lerp (from POC)
function moveToward(current, target, step) {
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

export function updateCamera(dt, camera, carGroup) {
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
