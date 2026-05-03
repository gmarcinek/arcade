import * as THREE from 'three';
import { BALL_MAT, BALL_PHYS, CFG, TUNNEL_R, CAR_OFF } from './config.js';
import { state } from './state.js';
import { emitBounce } from './sparks.js';

export function getBasis(theta) {
  return {
    surfaceOut: new THREE.Vector3( Math.sin(theta), -Math.cos(theta), 0),
    up:         new THREE.Vector3(-Math.sin(theta),  Math.cos(theta), 0),
    right:      new THREE.Vector3( Math.cos(theta),  Math.sin(theta), 0),
    forward:    new THREE.Vector3(0, 0, 1),
  };
}

// ── Yellow wake (kilwater) constants ──
const RIBBON_SEGS  = 140;
const RIBBON_WIDTH = 0.65;
const RIBBON_COLOR = new THREE.Color(0xfff600);

// Wake envelope timings
const WAKE_RAMP_UP        = 0.15;  // sec — fast attack on boost engage
const WAKE_FADE_OUT       = 1.0;   // sec — clean release linear fade
const SPUTTER_MIN_TIME    = 1.0;   // sec — minimum sputter duration
const SPUTTER_RANGE_TIME  = 0.5;   // sec — extra random duration (so 1.0–1.5 s)

// State filters — hysteresis to handle boost drain micro-cycles
const BOOST_FUEL_LOW    = 0.1;     // wake stays "active" only while boost > this
const BOOST_FUEL_GRACE  = 0.12;    // sec — filter 1-frame boostActive flickers

// JS smoothstep — same Hermite curve as GLSL
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function createBall(scene) {
  const ballMat = new THREE.MeshStandardMaterial({
    color:           BALL_MAT.color,
    metalness:       BALL_MAT.metalness,
    roughness:       BALL_MAT.roughness,
    envMapIntensity: BALL_MAT.envMapIntensity,
    transparent:     BALL_MAT.transparent,
    opacity:         BALL_MAT.opacity,
    depthWrite:      BALL_MAT.depthWrite,
  });

  const carGroup = new THREE.Group();
  const ball     = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 32), ballMat);
  carGroup.add(ball);

  const ringMat = new THREE.MeshBasicMaterial({
    color:       BALL_MAT.ringColor,
    transparent: true,
    opacity:     BALL_MAT.ringOpacity,
  });
  const equator = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.045, 8, 64), ringMat);
  carGroup.add(equator);

  scene.add(carGroup);

  // ── Yellow wake ribbon (#fff600) ──
  const ribbonHistory = [];
  const ribbonGeo     = new THREE.BufferGeometry();
  const ribbonPos     = new Float32Array(RIBBON_SEGS * 2 * 3);
  const ribbonAlpha   = new Float32Array(RIBBON_SEGS * 2);
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
  ribbonGeo.setAttribute('alpha',    new THREE.BufferAttribute(ribbonAlpha, 1));
  const ribbonIdx = [];
  for (let i = 0; i < RIBBON_SEGS - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    ribbonIdx.push(a, b, c, b, d, c);
  }
  ribbonGeo.setIndex(ribbonIdx);
  ribbonGeo.setDrawRange(0, 0);

  const ribbonMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: RIBBON_COLOR } },
    vertexShader: /* glsl */`
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
    blending:    THREE.AdditiveBlending,
  });

  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.frustumCulled = false;
  scene.add(ribbon);

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(BALL_MAT.reflectionRes, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
  scene.add(cubeCamera);
  ballMat.envMap = cubeRenderTarget.texture;

  const carLight  = new THREE.PointLight(0x80ffff, 2.5, 22);
  const tailLight = new THREE.PointLight(0xff5020, 0.9, 14);
  scene.add(carLight);
  scene.add(tailLight);

  return {
    carGroup, ball, equator, cubeCamera, ballMat, carLight, tailLight,
    ribbon, ribbonGeo, ribbonMat, ribbonHistory, ribbonPos, ribbonAlpha,

    // Wake state machine: 'idle' | 'active' | 'sputter' | 'fade'
    wakeMode:         'idle',
    ribbonIntensity:  0,
    activeGraceTime:  0,
    // Sputter sub-state
    sputterTime:      0,
    sputterDuration:  0,
    sputterPhase:     'gap',
    sputterPhaseEnd:  0,
    sputterAmp:       0,
  };
}

export function updateCarVisuals(dt, ballObjects, renderer, scene) {
  const {
    carGroup, ball, equator, cubeCamera, carLight, tailLight,
    ribbonGeo, ribbonHistory, ribbonPos, ribbonAlpha,
  } = ballObjects;

  state.frameCount++;
  const basis = getBasis(state.carTheta);
  const r = TUNNEL_R - CAR_OFF - state.radialOffset;

  carGroup.position.set(
    basis.surfaceOut.x * (r - 0.65),
    basis.surfaceOut.y * (r - 0.65),
    state.carZ,
  );

  if (state.bounceImpact > 0) {
    emitBounce(carGroup.position, basis.surfaceOut, state.speed, state.bounceImpact);
    state.bounceImpact = 0;
  }

  const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
  carGroup.quaternion.setFromRotationMatrix(matrix);

  // Rolling spin
  state.ballSpinAngle += (state.speed / 0.9) * dt;
  const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.ballSpinAngle);
  const leanQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.thetaVelocity * 0.06);
  ball.quaternion.copy(spinQ).multiply(leanQ);

  // Squash/stretch
  state.squashTimer = Math.max(0, state.squashTimer - dt);
  const sq           = state.squashTimer / BALL_PHYS.squashDuration;
  const scaleY       = 1.0 - sq * BALL_PHYS.squashAmount  * state.materialDamp;
  const scaleXZ      = 1.0 + sq * BALL_PHYS.stretchAmount * state.materialDamp;
  const speedStretch = 1.0 + Math.max(0, (state.speed - CFG.baseSpeed) / CFG.baseSpeed)
                              * BALL_PHYS.speedStretch * state.materialDamp;
  ball.scale.set(scaleXZ, scaleY, scaleXZ * speedStretch);
  equator.scale.copy(ball.scale);

  if (state.crashed) {
    const rollQ  = new THREE.Quaternion().setFromAxisAngle(basis.forward, state.tumbleRollAngle);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(basis.right,   state.tumblePitchAngle);
    carGroup.quaternion.multiply(rollQ).multiply(pitchQ);
  }

  // Equator ring colour
  const inAir     = !state.grounded && !state.crashed;
  const jumpReady = state.jumpCooldown <= 0;
  equator.material.opacity = inAir
    ? 0.55 + 0.15 * Math.sin(Date.now() * 0.015)
    : (!jumpReady && state.grounded ? 0.45 + 0.25 * Math.sin(Date.now() * 0.008) : 0.15);
  equator.material.color.setHex(
    inAir                          ? 0x80ffff
    : (!jumpReady && state.grounded ? 0xff8800
    :                                 0x00ffcc)
  );

  // Lights
  carLight.position.set(
    basis.surfaceOut.x * (r - 2),
    basis.surfaceOut.y * (r - 2),
    state.carZ + 1.5,
  );
  carLight.intensity  = state.boostActive ? 3.5 : 2.0;
  tailLight.position.set(basis.surfaceOut.x * r, basis.surfaceOut.y * r, state.carZ - 1.5);
  tailLight.intensity = state.boostActive ? 2.1 : 0.7;

  // ── Yellow wake (kilwater) — state machine ──
  // wakeShouldBeActive is FALSE when boost flickers off OR fuel drops below LOW threshold,
  // but the grace timer keeps wantWake true through brief drain micro-cycles.
  const wakeShouldBeActive = state.boostActive && state.boost > BOOST_FUEL_LOW && !state.crashed;
  if (wakeShouldBeActive) {
    ballObjects.activeGraceTime = 0;
  } else {
    ballObjects.activeGraceTime += dt;
  }
  const wantWake = wakeShouldBeActive || ballObjects.activeGraceTime < BOOST_FUEL_GRACE;

  // Mode transitions
  const mode = ballObjects.wakeMode;
  if (wantWake && mode !== 'active') {
    // Enter active from any mode — fresh wake from a point at the ball
    ribbonHistory.length = 0;
    ballObjects.wakeMode = 'active';
  } else if (!wantWake && mode === 'active') {
    // Exit active — pick reason: empty fuel → sputter, otherwise → clean fade
    if (!state.crashed && state.boost <= BOOST_FUEL_LOW) {
      ballObjects.wakeMode        = 'sputter';
      ballObjects.sputterTime     = 0;
      ballObjects.sputterDuration = SPUTTER_MIN_TIME + Math.random() * SPUTTER_RANGE_TIME;
      ballObjects.sputterPhase    = 'gap';
      ballObjects.sputterPhaseEnd = 0;
      ballObjects.sputterAmp      = 0;
    } else {
      ballObjects.wakeMode = 'fade';
    }
  } else if (mode === 'sputter' && state.crashed) {
    // Crash interrupts sputter → smooth fade
    ballObjects.wakeMode = 'fade';
  }

  // Per-mode intensity update
  switch (ballObjects.wakeMode) {
    case 'active':
      ballObjects.ribbonIntensity = Math.min(1, ballObjects.ribbonIntensity + dt / WAKE_RAMP_UP);
      break;

    case 'sputter': {
      ballObjects.sputterTime += dt;
      if (ballObjects.sputterTime >= ballObjects.sputterDuration) {
        // Sputter done
        ballObjects.wakeMode        = 'idle';
        ballObjects.ribbonIntensity = 0;
      } else {
        // Phase machine — irregular firing/gap pulses
        if (ballObjects.sputterTime >= ballObjects.sputterPhaseEnd) {
          if (ballObjects.sputterPhase === 'firing') {
            ballObjects.sputterPhase    = 'gap';
            ballObjects.sputterPhaseEnd = ballObjects.sputterTime + 0.05 + Math.random() * 0.18;
          } else {
            ballObjects.sputterPhase    = 'firing';
            ballObjects.sputterPhaseEnd = ballObjects.sputterTime + 0.05 + Math.random() * 0.10;
            ballObjects.sputterAmp      = 0.55 + Math.random() * 0.45;
          }
        }
        // Linear envelope decays over duration; firings ride on top, gaps are 0
        const envelope = 1 - ballObjects.sputterTime / ballObjects.sputterDuration;
        const amp      = ballObjects.sputterPhase === 'firing' ? ballObjects.sputterAmp : 0;
        ballObjects.ribbonIntensity = envelope * amp;
      }
      break;
    }

    case 'fade':
      ballObjects.ribbonIntensity = Math.max(0, ballObjects.ribbonIntensity - dt / WAKE_FADE_OUT);
      if (ballObjects.ribbonIntensity <= 0) ballObjects.wakeMode = 'idle';
      break;

    case 'idle':
    default:
      ballObjects.ribbonIntensity = 0;
      break;
  }

  const intensity = ballObjects.ribbonIntensity;
  const alive     = ballObjects.wakeMode !== 'idle';

  // Keep emitting positions while wake is in any non-idle mode (including sputter gaps)
  // so the wake stays attached to the ball through every phase.
  if (alive && !state.crashed) {
    ribbonHistory.push({
      pos:   carGroup.position.clone(),
      right: basis.right.clone(),
    });
    if (ribbonHistory.length > RIBBON_SEGS) ribbonHistory.shift();
  } else if (!alive) {
    ribbonHistory.length = 0;
  }

  // Render only when there's actually visible intensity (skips sputter gaps entirely)
  const n = ribbonHistory.length;
  if (n >= 2 && intensity > 0.001) {
    for (let i = 0; i < n; i++) {
      const h = ribbonHistory[i];
      const t = i / (n - 1);  // 0 = oldest tail, 1 = head (at ball)

      // Wake taper: 0 width at head, smoothly expanding to MAX along the trail.
      const widthFactor = 1.0 - smoothstep(0.55, 1.0, t);
      const w  = RIBBON_WIDTH * widthFactor * intensity;

      const ox = h.right.x * w;
      const oy = h.right.y * w;
      const oz = h.right.z * w;
      const pi = i * 6;
      ribbonPos[pi    ] = h.pos.x + ox;
      ribbonPos[pi + 1] = h.pos.y + oy;
      ribbonPos[pi + 2] = h.pos.z + oz;
      ribbonPos[pi + 3] = h.pos.x - ox;
      ribbonPos[pi + 4] = h.pos.y - oy;
      ribbonPos[pi + 5] = h.pos.z - oz;

      // Soft fade-in at the very tail so the back of the wake dissolves cleanly
      const a  = smoothstep(0.0, 0.2, t) * intensity;
      const ai = i * 2;
      ribbonAlpha[ai    ] = a;
      ribbonAlpha[ai + 1] = a;
    }
    ribbonGeo.attributes.position.needsUpdate = true;
    ribbonGeo.attributes.alpha.needsUpdate    = true;
    ribbonGeo.setDrawRange(0, (n - 1) * 6);
  } else {
    ribbonGeo.setDrawRange(0, 0);
  }

  // Live reflection — every 10 frames
  if (state.frameCount % 10 === 0) {
    cubeCamera.position.copy(carGroup.position);
    carGroup.visible = false;
    cubeCamera.update(renderer, scene);
    carGroup.visible = true;
  }
}