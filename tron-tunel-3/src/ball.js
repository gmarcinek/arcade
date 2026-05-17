import * as THREE from 'three';
import { BALL_MAT, BALL_PHYS, CFG, PROC_CFG, TUNNEL_R, CAR_OFF, DEATH_BLAST_DURATION_S, DEATH_BLAST_SCALE_MAX } from './config.js';
import { input } from './input.js';
import { state } from './state.js';
import { emitBounce, emitEdgeScratch, emitExplosionBurst } from './sparks.js';
import { settings } from './hud/settings.js';


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

function makeArrow(color, scene) {
  const a = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    1, color, 0.45, 0.22,
  );
  a.traverse(child => {
    child.renderOrder = 999;
    if (child.material) {
      child.material.depthTest  = false;
      child.material.depthWrite = false;
      child.material.transparent = true;
    }
  });
  a.renderOrder = 999;
  a.visible = false;
  scene.add(a);
  return a;
}

function setArrow(arrow, pos, dir, len, show) {
  const visible = show && len > 0.05;
  arrow.visible = visible;
  if (!visible) return;
  arrow.position.copy(pos);
  arrow.setDirection(dir.clone().normalize());
  arrow.setLength(len, Math.min(0.45, len * 0.35), 0.22);
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

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(settings.reflectionRes, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
  scene.add(cubeCamera);
  ballMat.envMap = cubeRenderTarget.texture;

  const carLight   = new THREE.PointLight(0x80ffff, 2.5, 22);
  const tailLight  = new THREE.PointLight(0xff5020, 0.9, 14);
  const headLight  = new THREE.PointLight(0xffffff, 0, 80);
  scene.add(carLight);
  scene.add(tailLight);
  scene.add(headLight);

  // Force debug arrows (world-space, toggled by F key)
  const arrowInertia   = makeArrow(0x22ff66, scene);  // green   — lateral inertia (thetaVelocity)
  const arrowRadial    = makeArrow(0xff4422, scene);  // red     — radial velocity (gravity/bounce)
  const arrowInput     = makeArrow(0x2288ff, scene);  // blue    — steering input force
  const arrowResultant = makeArrow(0xffee00, scene);  // yellow  — resultant
  const arrowGravWorld = makeArrow(0xffffff, scene);  // white   — world gravity (0,-g,0)
  const arrowGravLat   = makeArrow(0xff44ff, scene);  // magenta — gravity projected onto lateral axis

  // Pivot axes — shows ball local frame (red=right, green=out, blue=forward)
  const pivotAxes = new THREE.AxesHelper(2.5);
  pivotAxes.traverse(child => {
    child.renderOrder = 999;
    if (child.material) {
      child.material.depthTest   = false;
      child.material.depthWrite  = false;
      child.material.transparent = true;
    }
  });
  pivotAxes.renderOrder = 999;
  pivotAxes.visible = false;
  scene.add(pivotAxes);

  return {
    carGroup, ball, equator, cubeCamera, ballMat, carLight, tailLight, headLight,
    ribbon, ribbonGeo, ribbonMat, ribbonHistory, ribbonPos, ribbonAlpha,

    // Wake state machine: 'idle' | 'active' | 'sputter' | 'fade'
    wakeMode:         'idle',
    _edgeScratchCooldown: 0,
    ribbonIntensity:  0,
    activeGraceTime:  0,
    // Sputter sub-state
    sputterTime:      0,
    sputterDuration:  0,
    sputterPhase:     'gap',
    sputterPhaseEnd:  0,
    sputterAmp:       0,
    // Debug arrows
    arrowInertia, arrowRadial, arrowInput, arrowResultant, pivotAxes,
    arrowGravWorld, arrowGravLat,
  };
}

export function updateCarVisuals(dt, ballObjects, renderer, scene, proceduralFrame = null) {
  const {
    carGroup, ball, equator, cubeCamera, carLight, tailLight, headLight, ballMat,
    ribbonGeo, ribbonHistory, ribbonPos, ribbonAlpha,
  } = ballObjects;

  state.frameCount++;
  const basis = getBasis(state.carTheta);
  const r = TUNNEL_R - CAR_OFF - state.radialOffset;

  if (!proceduralFrame) {
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
  } else {
    // Procedural mode: position already set by updateBallPositionFromFrame
    if (state.bounceImpact > 0) {
      emitBounce(carGroup.position, proceduralFrame.up, state.speed, state.bounceImpact);
      state.bounceImpact = 0;
    }
  }

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
  // Heat swell: lerp scale multiplier toward 1+heat (max 2×) and back
  const heatScaleTarget = 1.0 + (state.edgeHeat ?? 0);
  if (ballObjects._heatScale === undefined) ballObjects._heatScale = 1.0;
  ballObjects._heatScale += (heatScaleTarget - ballObjects._heatScale) * (1.0 - Math.exp(-dt * 3.0));
  const hs = ballObjects._heatScale;
  let deathBlastGrowth = 1.0;

  if (ballObjects._deathBlastActive) {
    ballObjects._deathBlastTime = (ballObjects._deathBlastTime ?? 0) + dt;
    const t = Math.max(0, Math.min(1, ballObjects._deathBlastTime / DEATH_BLAST_DURATION_S));
    const blastStart = ballObjects._deathBlastStartPos;
    const blastDir = ballObjects._deathBlastDir;

    if (blastStart && blastDir) {
      const blastSpeed = ballObjects._deathBlastSpeed ?? 0;
      const dist = blastSpeed * ballObjects._deathBlastTime * (1.0 - 0.35 * t);
      carGroup.position.copy(blastStart).addScaledVector(blastDir, dist);
    }

    const blastEaseOut = 1.0 - Math.pow(1.0 - t, 3.0);
    deathBlastGrowth = 1.0 + (DEATH_BLAST_SCALE_MAX - 1.0) * blastEaseOut;
  }

  state.ballHeatScale = hs;
  ball.scale.set(
    scaleXZ * hs * deathBlastGrowth,
    scaleY * hs * deathBlastGrowth,
    scaleXZ * speedStretch * hs * deathBlastGrowth,
  );
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
  if (!proceduralFrame) {
    carLight.position.set(
      basis.surfaceOut.x * (r - 2),
      basis.surfaceOut.y * (r - 2),
      state.carZ + 1.5,
    );
    tailLight.position.set(basis.surfaceOut.x * r, basis.surfaceOut.y * r, state.carZ - 1.5);
  } else {
    carLight.position.copy(carGroup.position).addScaledVector(proceduralFrame.forward, 1.5);
    tailLight.position.copy(carGroup.position).addScaledVector(proceduralFrame.forward, -1.5);
  }
  carLight.intensity  = state.boostActive ? 3.5 : 2.0;
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
      right: proceduralFrame ? proceduralFrame.right.clone() : basis.right.clone(),
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

  // ── Ball visuals: dark metallic always. Only heat and boost affect appearance ──
  const heat = state.edgeHeat ?? 0;
  const ep   = state.edgeProximity ?? 0;

  if (heat > 0.01) {
    // Heat colour ramp: dark red → orange → yellow-white
    let eR, eG, eB;
    if (heat < 0.35) {
      const t = heat / 0.35;
      eR = t * 0.55; eG = 0; eB = 0;
    } else if (heat < 0.65) {
      const t = (heat - 0.35) / 0.30;
      eR = 0.55 + t * 0.45; eG = t * 0.45; eB = 0;
    } else {
      const t = (heat - 0.65) / 0.35;
      eR = 1.0; eG = 0.45 + t * 0.45; eB = t * 0.35;
    }
    ballMat.emissive.setRGB(eR, eG, eB);
    ballMat.emissiveIntensity = 0.8 + heat * heat * 14.0;

    // Light color: deep red → orange → yellow-white at max heat
    const lR = 1.0;
    const lG = heat < 0.5 ? heat * 0.60 : 0.30 + (heat - 0.5) * 1.40;
    const lB = heat < 0.7 ? 0.0        : (heat - 0.7) * 0.80;
    carLight.color.setRGB(lR, Math.min(1, lG), Math.min(1, lB));
    // Intensity: quadratic growth — dim at low heat, blazing at high heat
    carLight.intensity = 1.5 + heat * heat * 28.0;
    // Spread: 18m cold → 55m at full heat (matches swollen ball radius)
    carLight.distance  = 18 + heat * 37;
    // tailLight joins the heat glow — warm orange halo behind the ball
    tailLight.color.setRGB(1.0, 0.20 + heat * 0.40, 0.0);
    tailLight.intensity = 0.5 + heat * heat * 8.0;
    tailLight.distance  = 10 + heat * 20;

    // Edge sparks
    if (ep > 0.05 && ballObjects._edgeScratchCooldown <= 0) {
      const tangent = proceduralFrame ? proceduralFrame.right : new THREE.Vector3(1, 0, 0);
      emitEdgeScratch(carGroup.position, tangent, state.speed ?? state.sVelocity, ep);
      ballObjects._edgeScratchCooldown = Math.max(0.015, 0.06 * (1.0 - heat * 0.7));
      window.dispatchEvent(new CustomEvent('onEdgeScratch', {
        detail: { heat, proximity: ep, position: carGroup.position.clone() }
      }));
    }

    // Mini-burst explosions
    if (heat > 0.3 || state.outOfBounds) {
      if (ballObjects._miniBurstCooldown === undefined) ballObjects._miniBurstCooldown = 0.4 + Math.random() * 1.0;
      if (ballObjects._miniBurstCooldown <= 0) {
        const fwd = proceduralFrame ? proceduralFrame.forward : new THREE.Vector3(0, 0, 1);
        emitBounce(carGroup.position, fwd.clone().negate(), state.speed ?? state.sVelocity, 8 + heat * 20);
        ballObjects._miniBurstCooldown = 0.4 + Math.random() * 1.0;
      }
      ballObjects._miniBurstCooldown -= dt;
    }
  } else {
    // Cold ball: pure black, no emissive
    ballMat.emissive.setRGB(0, 0, 0);
    ballMat.emissiveIntensity = 0;

    // Boost: brighter cyan light; idle: dim cyan
    carLight.color.setRGB(0.502, 1.0, 1.0);
    carLight.intensity = state.boostActive ? 4.5 : 2.0;
    carLight.distance  = state.boostActive ? 35 : 22;
    tailLight.color.setRGB(1.0, 0.31, 0.12);
    tailLight.intensity = state.boostActive ? 2.1 : 0.7;
    tailLight.distance  = state.boostActive ? 18 : 10;
  }

  headLight.intensity = 0;

  if (ballObjects._edgeScratchCooldown === undefined) ballObjects._edgeScratchCooldown = 0;
  if (ballObjects._edgeScratchCooldown > 0) ballObjects._edgeScratchCooldown -= dt;

  // Live reflection — every 10 frames
  if (state.frameCount % 10 === 0) {
    cubeCamera.position.copy(carGroup.position);
    carGroup.visible = false;
    cubeCamera.update(renderer, scene);
    carGroup.visible = true;
  }

  // ── Force debug visualization ──
  if (ballObjects.arrowInertia !== undefined) {
    const SCALE = 0.60;

    // Ball local frame — proc mode has its own axes, classic uses cylindrical basis
    const ballRight   = proceduralFrame ? proceduralFrame.right   : basis.right;
    const ballOut     = proceduralFrame ? proceduralFrame.normal  : basis.surfaceOut;
    const ballForward = proceduralFrame ? proceduralFrame.forward : basis.forward;

    // Offset origin above ball surface so arrows aren't inside the mesh
    const pos = carGroup.position.clone().addScaledVector(ballOut, 1.2);

    // Pivot axes — orient to ball local frame and show when debug is on
    if (ballObjects.pivotAxes) {
      ballObjects.pivotAxes.position.copy(pos);
      ballObjects.pivotAxes.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(ballRight, ballOut, ballForward)
      );
      ballObjects.pivotAxes.visible = state.showForces;
    }

    // Lateral inertia: proc mode uses uVelocity, classic uses thetaVelocity
    const latVel = proceduralFrame ? state.uVelocity : state.thetaVelocity;
    const latV   = latVel * TUNNEL_R;
    const latDir = ballRight.clone().multiplyScalar(latV >= 0 ? 1 : -1);
    setArrow(ballObjects.arrowInertia, pos, latDir, Math.abs(latV) * SCALE, state.showForces);

    // Radial velocity: positive = away from wall (toward centre), negative = toward wall
    const radV   = state.radialVelocity;
    const radDir = ballOut.clone().multiplyScalar(radV >= 0 ? 1 : -1);
    setArrow(ballObjects.arrowRadial, pos, radDir, Math.abs(radV) * SCALE, state.showForces);

    // Steering input: read directly from input state, works in both modes
    const rawSteer    = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAccel  = proceduralFrame ? PROC_CFG.STEER_ACCELERATION : CFG.steerAcceleration;
    const inV         = rawSteer * steerAccel;
    const hasSteer    = Math.abs(inV) > 0.01;
    const steerLen    = hasSteer ? Math.abs(inV) * SCALE : Math.min(Math.abs(latVel) * SCALE, 1.5);
    const steerSign   = (hasSteer ? inV : latVel) >= 0 ? 1 : -1;
    const steerDir    = ballRight.clone().multiplyScalar(steerSign);
    setArrow(ballObjects.arrowInput, pos, steerDir, steerLen,
      state.showForces && (hasSteer || Math.abs(latVel) > 0.05));

    // Resultant: lateral inertia + radial, in cross-section plane
    const resultVec = new THREE.Vector3()
      .addScaledVector(ballRight, latV   * SCALE)
      .addScaledVector(ballOut,   radV   * SCALE);
    const resultLen = resultVec.length();
    const resultDir = resultLen > 0.05 ? resultVec.clone().normalize() : ballRight.clone();
    setArrow(ballObjects.arrowResultant, pos, resultDir, resultLen, state.showForces);

    // World gravity: always points (0,-1,0) in world space — scaled by tunnelGravity
    const gravWorld = new THREE.Vector3(0, -1, 0);
    const gravWorldLen = CFG.tunnelGravity * SCALE;
    setArrow(ballObjects.arrowGravWorld, pos, gravWorld, gravWorldLen, state.showForces);

    // Lateral gravity projection: component of world gravity along ballRight axis
    // This is the constant sideways force pushing ball depending on its theta position
    const gravLat    = gravWorld.dot(ballRight);  // positive = pushes in +right direction
    const gravLatDir = ballRight.clone().multiplyScalar(gravLat >= 0 ? 1 : -1);
    const gravLatLen = Math.abs(gravLat) * gravWorldLen;
    setArrow(ballObjects.arrowGravLat, pos, gravLatDir, gravLatLen,
      state.showForces && gravLatLen > 0.05);
  }
}

export function updateBallPositionFromFrame(carGroup, frame) {
  if (!frame) return;
  carGroup.position.copy(frame.position);
  // Orient the ball: up = inward normal, forward = tangent
  const up  = frame.normal.clone();       // inward normal = "up" inside tube
  const fwd = frame.forward.clone();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const correctedFwd = new THREE.Vector3().crossVectors(up, right).normalize();
  carGroup.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, correctedFwd.negate())
  );
}