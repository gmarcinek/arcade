import * as THREE from 'three';
import {
  CAM_SPRING, CAM_DAMP, CAM_MAX_VEL,
  CAM_FOV_NORMAL, CAM_FOV_BOOST, CAM_FOV_ENTER_S, CAM_FOV_EXIT_S,
  CAM_HEIGHT_NORMAL, CAM_HEIGHT_BOOST,
  CAM_DIST_NORMAL, CAM_DIST_FORWARD, CAM_DIST_BACK,
  TUNNEL_R, DEMO_CAM, CFG,
} from './config.js';
import { state } from './state.js';
import { input } from './input.js';
import { PROC_CFG } from './config.js';

// Constant-rate lerp — more predictable than exp lerp (from POC)
function moveToward(current, target, step) {
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

// ── Demo Camera: target values picked once per mode switch (no per-frame jitter) ──
let _demoCamTargetDist     = 8;
let _demoCamTargetHeight   = 4;
let _demoCamTargetPanRate  = 0;
let _demoCamTargetRollRate = 0;
let _demoCamTargetOscAmp   = 0;
let _demoCamBiasUp         = null;  // lerped world-up-biased height direction
let _demoCamPos            = null;  // minimal lerp on camera position
let _demoCamLiveDist       = 4;     // current live dist (slowly oscillates 1–15 m)
let _demoCamDistTarget     = 4;     // target dist to lerp toward
let _demoCamDistTimer      = 0;     // countdown to next dist target pick

function _pickDemoTargets(modeConfig) {
  const rand = (v, r) => v + (Math.random() * 2 - 1) * r;
  const dRand = modeConfig.distRand ?? DEMO_CAM.distRand;
  _demoCamTargetDist     = rand(modeConfig.dist,    dRand);
  _demoCamTargetHeight   = rand(modeConfig.height,  DEMO_CAM.heightRand);
  _demoCamTargetPanRate  = modeConfig.panRate;  // bez randomizacji — orbit musi trafic pełny obrót
  _demoCamTargetRollRate = (modeConfig.rollRate ?? 0) * (Math.random() < 0.5 ? 1 : -1);
  _demoCamTargetOscAmp   = Math.max(0, rand(modeConfig.oscAmp, DEMO_CAM.oscRand));
}

function updateDemoCamera(dt, camera, proceduralFrame) {
  if (!proceduralFrame) return;

  // 1. Advance mode timer and switch
  state.demoCamModeTime += dt;
  const { modeDuration, modeTransition, modes } = DEMO_CAM;

  if (state.demoCamModeTime >= modeDuration + modeTransition) {
    state.demoCamMode = (state.demoCamMode + 1) % modes.length;
    state.demoCamModeTime = 0;
    _pickDemoTargets(modes[state.demoCamMode]);
  }

  // 2. Interpolate targets toward next mode during transition
  const blendT = Math.max(0, (state.demoCamModeTime - modeDuration) / modeTransition);
  const nextCfg = modes[(state.demoCamMode + 1) % modes.length];
  // dist comes from live oscillator, not mode blend
  _demoCamDistTimer -= dt;
  if (_demoCamDistTimer <= 0) {
    _demoCamDistTarget = 1 + Math.random() * 14;   // 1–15 m
    _demoCamDistTimer  = 4 + Math.random() * 6;    // next change in 4–10 s
  }
  _demoCamLiveDist += (_demoCamDistTarget - _demoCamLiveDist) * (1 - Math.exp(-dt * 0.4));
  const dist     = _demoCamLiveDist;
  const height   = THREE.MathUtils.lerp(_demoCamTargetHeight,   nextCfg.height,   blendT);
  const panRate  = THREE.MathUtils.lerp(_demoCamTargetPanRate,  nextCfg.panRate,  blendT);
  const rollRate = THREE.MathUtils.lerp(_demoCamTargetRollRate, nextCfg.rollRate, blendT);
  const oscAmp   = THREE.MathUtils.lerp(_demoCamTargetOscAmp,  nextCfg.oscAmp,   blendT);

  // 3. Accumulate angles
  state.demoCamPanAngle  += panRate  * dt;
  state.demoCamRollAngle += rollRate * dt;
  state.demoCamOscTime   += dt;

  // When not orbiting, drift pan angle back to nearest full rotation (behind ball)
  if (Math.abs(panRate) < 0.01) {
    const nearestFull = Math.round(state.demoCamPanAngle / (Math.PI * 2)) * (Math.PI * 2);
    state.demoCamPanAngle += (nearestFull - state.demoCamPanAngle) * (1 - Math.exp(-dt * 0.8));
  }

  const osc = Math.sin(state.demoCamOscTime * 1.3) * oscAmp;

  // 4. Surface-aligned axes from frame
  const ballPos = proceduralFrame.position;
  const fwd   = proceduralFrame.forward.clone().normalize();
  const right = (proceduralFrame.right ?? proceduralFrame.binormal).clone().normalize();
  const up    = proceduralFrame.normal.clone().normalize();

  // 4b. preferUp = surface normal at ball's contact point (inward, toward axis).
  //     This is the tunnel-local "above": camera goes between ball and tunnel axis.
  //     Lerp smoothly so rapid surface changes (twists/rolls) don't snap the camera.
  const preferUp = up.clone();
  if (!_demoCamBiasUp) _demoCamBiasUp = preferUp.clone();
  _demoCamBiasUp.lerp(preferUp, 1 - Math.exp(-dt * 8)).normalize();

  // 5. Orbit offset: pan rotates the back-vector around the surface normal
  //    panAngle=0 → directly behind ball; panAngle=π/2 → side view
  const panCos = Math.cos(state.demoCamPanAngle);
  const panSin = Math.sin(state.demoCamPanAngle);
  const horizontal = fwd.clone().multiplyScalar(-panCos)
    .addScaledVector(right, panSin);
  // height in config = desired metres above tunnel surface (not ball-normal offset).
  // Derive the actual normal offset so the camera sits exactly at that height above
  // the wall, regardless of horizontal dist.
  //   Camera is at distance sqrt(dist² + (R−normalOff)²) from tunnel axis.
  //   Setting that = R − surfaceH  →  normalOff = R − sqrt((R−surfaceH)² − dist²)
  const surfaceH   = height + osc;
  const innerR     = TUNNEL_R - surfaceH;          // desired camera–axis distance
  const normalOff  = TUNNEL_R - Math.sqrt(Math.max(0, innerR * innerR - dist * dist));
  const camOffset  = horizontal.multiplyScalar(dist)
    .addScaledVector(_demoCamBiasUp, normalOff);

  // 6. Minimal camera position lerp (τ ≈ 0.1 s — instant tracking, no jitter)
  const rawPos = ballPos.clone().add(camOffset);
  if (!_demoCamPos) _demoCamPos = rawPos.clone();
  _demoCamPos.lerp(rawPos, 1 - Math.exp(-dt * 10));
  camera.position.copy(_demoCamPos);

  // 7. Look at ball (+ 2 m ahead so ball stays in lower-centre of frame)
  const lookTarget = ballPos.clone().addScaledVector(fwd, 2.0);

  // 8. Safe camera.up: surface normal is fine for behind/far shots, but is
  //    near-parallel to viewDir in top-down and orbit-from-side modes → gimbal lock.
  //    Fall back to tunnel-forward (fwd) when the dot product is too high.
  const viewDir = lookTarget.clone().sub(camera.position).normalize();
  const upDotView = Math.abs(up.dot(viewDir));
  const baseUp = upDotView > 0.85 ? fwd.clone() : up.clone();
  if (Math.abs(state.demoCamRollAngle) > 0.001) {
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(viewDir, state.demoCamRollAngle);
    baseUp.applyQuaternion(rollQuat);
  }
  // MUST be set BEFORE lookAt — Three.js reads camera.up at call time
  camera.up.copy(baseUp);
  camera.lookAt(lookTarget);

  // 9. FOV — per-mode, blended during transition
  const fovA = modes[state.demoCamMode].fov ?? 85;
  const fovB = modes[(state.demoCamMode + 1) % modes.length].fov ?? 85;
  const fovTarget = THREE.MathUtils.lerp(fovA, fovB, blendT);
  state.cameraFovCurrent = moveToward(state.cameraFovCurrent, fovTarget, 50 * dt);
  if (Math.abs(camera.fov - state.cameraFovCurrent) > 0.01) {
    camera.fov = state.cameraFovCurrent;
    camera.updateProjectionMatrix();
  }
}

export function updateCamera(dt, camera, carGroup, proceduralFrame = null) {
  // ── Tryb DEMO ──
  if (state.demoMode && DEMO_CAM.enabled) {
    updateDemoCamera(dt, camera, proceduralFrame);
    return;
  }
  
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

// ── API do włączania/wyłączania demo mode ──
export function toggleDemoMode(enable = null) {
  if (enable === null) {
    state.demoMode = !state.demoMode;
  } else {
    state.demoMode = enable;
  }
  
  if (state.demoMode) {
    state.demoCamMode = 0;
    state.demoCamModeTime = 0;
    state.demoCamPanAngle = 0;
    state.demoCamRollAngle = 0;
    state.demoCamOscTime = 0;
    _demoCamBiasUp      = null;
    _demoCamPos         = null;
    _demoCamLiveDist    = 4;
    _demoCamDistTarget  = 4;
    _demoCamDistTimer   = 0;
    _pickDemoTargets(DEMO_CAM.modes[0]);
    CFG.tunnelAngularGravity = 24;
    CFG.tunnelAngularDamp    = 24;
    console.log('✨ DEMO Camera + Autopilot');
  } else {
    CFG.tunnelAngularGravity = 0;
    CFG.tunnelAngularDamp    = 24;
    console.log('📷 DEMO Camera wyłączona');
  }
}

// Dostęp z konsoli
if (typeof window !== 'undefined') {
  window.toggleDemoMode = toggleDemoMode;
  
  // Pokaż dostępne komendy
  console.log(
    '%c🎬 DEMO Camera\n\n' +
    '%cWłaściwości:\n' +
    '  - toggleDemoMode() — włącz/wyłącz tryb DEMO\n' +
    '  - toggleDemoMode(true) — włącz\n' +
    '  - toggleDemoMode(false) — wyłącz\n\n' +
    '%cTryby kamery:\n' +
    '  0️⃣  Close — bliska kamera\n' +
    '  1️⃣  Far — daleka kamera\n' +
    '  2️⃣  High — wysoka kamera\n' +
    '  3️⃣  Pan — obrotowa kamera\n' +
    '  4️⃣  Roll — kamera z rollem\n' +
    '  5️⃣  Orbit — orbitalna kamera\n' +
    '  6️⃣  Dynamic — szybko zmieniająca się\n',
    'color: #00d9ff; font-size: 14px; font-weight: bold;',
    'color: #fbbf24; font-size: 12px; font-weight: bold;',
    'color: #fbbf24; font-size: 12px; font-weight: bold;'
  );
}
