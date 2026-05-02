import * as THREE from 'three';

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const flashEl = document.getElementById('flash');
const dangerEl = document.getElementById('danger-warn');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040c);
scene.fog = new THREE.Fog(0x040816, 28, 220);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

const TUNNEL_R = 12;
const TUNNEL_LEN = 500;
const LANE_COUNT = 120;
const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT;  // 0.05236 rad per lane
const CAR_OFF = 0.32;
const DANGER_TIMEOUT = 3.0;

// ---- Physics config ----
const CFG = {
  // --- Speed ---
  baseSpeed:           32,    // m/s at start
  boostSpeed:          90,    // m/s top speed while boosting
  acceleration:        5,     // lerp rate speed→target (higher = snappier)

  // --- Steering ---
  steerAcceleration:   5.5,   // angular impulse per second when key held
  maxThetaVelocity:    4.8,   // rad/s max lateral speed around tunnel
  groundedFriction:    7.5,   // angular damping when on ground (exp decay rate)
  airFriction:         1.2,   // angular damping in air (much lower → drifts)
  airControl:          0.35,  // 0‒1 fraction of steer force available in air

  // --- Jump / gravity ---
  jumpImpulse:         18.5,  // initial radial velocity on jump (m/s away from wall)
  tunnelGravity:       36,    // radial gravity pulling back to wall (m/s²)
  maxRadialOffset:     10,    // max meters ball can float away from wall

  // --- Boost ---
  boostDrain:          0.42,  // boost bar units/s while active
  boostRegen:          0.20,  // boost bar units/s while idle

  // --- Respawn ---
  crashRespawnSec:     1.25,  // seconds tumbling before respawn
};

// ---- Ball physics material ----
// Controls how the ball "feels" — deformation, bounce, steering inertia
const BALL_PHYS = {
  restitution:    0.92,  // 0–1: energia zachowana po odbiciu (0=ołów, 1=suprball)

  squashDuration: 1.0,   // sekund trwa odkształcenie po kontakcie
  squashAmount:   0.05,  // max spłaszczenie radialne (0.05 = 5%)
  stretchAmount:  0.10,  // kompensacyjne rozciągnięcie boczne
  speedStretch:   0.12,  // wydłużenie do przodu od prędkości

  steerLagK:      5.5,   // (nieużywane — zachowane dla referencji)
                         // siła jest natychmiastowa; masa kuli = steerAcceleration + inertiaDecay

  inertiaDecay:   1,   // tłumienie bezwładu bocznego gdy brak inputu
                         // 0 = kulka dryftuje wiecznie, 9 = zatrzymuje się jak po hamulcu
                         // kiedy klawisz wciśnięty — zamiast tego użyty groundedFriction
                         // (tzn. napęd bierze górę szybciej niż naturalny zanik)

  surfaceDamp:    2.0,  // tłumienie mikroodbitej przy podłożu
                         // aplikowane tylko gdy radialOffset < surfaceDampRadius
                         // I kulka leci W DÓŁ → eliminuje mikro-drgania/hops
  surfaceDampRadius: 0.5, // [m] strefa przyścienna w której aktywuje się tłumienie

  bounceThreshold: 1.5,  // min prędkość [m/s] po odbiciu żeby liczyło się jako bounce
                         // poniżej tej wartości kulka od razu "siada"
};

// ---- Ball visual / shader material ----
const BALL_MAT = {
  // --- Chrome appearance ---
  color:           0xdddddd, // base tint (0xffffff = pure mirror, darker = tinted chrome)
  metalness:       0.2,      // 0 = plastic, 1 = full metal
  roughness:       0.01,     // 0 = perfect mirror, 1 = fully diffuse

  // --- Live tunnel reflections (CubeCamera) ---
  reflectionRes:   256,       // cube map face size in px (powers of 2: 32/64/128/256)
                             // higher = crisper reflection, heavier GPU cost
  envMapIntensity: 1.0,      // 0‒2 blend of env-map into final colour

  // --- Equator ring ---
  ringOpacity:     0.9,      // base opacity of the equator glow ring
  ringColor:       0x60ffee, // equator ring default colour

  // --- Sub-surface / transparency ---
  transparent:     false,    // true = ball is see-through
  opacity:         1.0,      // 0‒1 overall ball transparency (only if transparent:true)
  depthWrite:      true,     // false = tunnel visible through ball regardless of opacity
};

// ---- Arc profile: drivable half-angle as function of Z ----
// Ranges from ~4 lanes/side (very narrow, ±12°) to ~60 lanes/side (full, ±180°)
function getArcHalfAngle(z) {
  const slow = Math.sin(z * 0.009);          // main wave ~700 m period
  const med  = Math.sin(z * 0.038) * 0.42;  // secondary ~165 m period
  const t = Math.max(0, Math.min(1, (slow + med + 1.42) / 2.84));
  return (4 + t * 56) * LANE_ANGLE;          // 4..60 lanes per side
}

// ---- Tunnel shader (arc-aware: safe zone bright, restricted zone dark/red) ----
const tunnelMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, playerZ: { value: 0 } },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform float playerZ;
    varying vec3 vWorld;

    // Must match JS getArcHalfAngle exactly
    float arcHalfAtZ(float z) {
      float slow = sin(z * 0.009);
      float med  = sin(z * 0.038) * 0.42;
      float t = clamp((slow + med + 1.42) / 2.84, 0.0, 1.0);
      return (4.0 + t * 56.0) * 0.05236;
    }

    void main() {
      // angle=0 at tunnel bottom (where car starts, carTheta=0)
      // matches JS: car at (sin(t)*r, -cos(t)*r) → atan(sin(t),cos(t))=t
      float angle = atan(vWorld.x, -vWorld.y);
      float absAngle = abs(angle);
      float localArcH = arcHalfAtZ(vWorld.z);
      float inSafe = step(absAngle, localArcH);

      // base colour: bright inside arc, dark danger outside
      vec3 col = mix(vec3(0.07, 0.01, 0.01), vec3(0.045, 0.065, 0.115), inSafe);

      // panel ridges (120 per circle = 1 per lane)
      float panel = abs(sin(angle * 60.0));
      col += smoothstep(0.90, 1.0, panel) * vec3(0.14, 0.20, 0.30) * (0.25 + inSafe * 0.75);

      // longitudinal ring seams
      float ring = abs(sin(vWorld.z * 0.7854));
      col += smoothstep(0.96, 1.0, ring) * vec3(0.10, 0.18, 0.30) * inSafe;

      // 8 cyan running-light strips (safe zone only)
      float strip = step(0.985, abs(sin(angle * 4.0)));
      float pulse = sin(vWorld.z * 0.55 - time * 6.0);
      pulse = smoothstep(0.25, 1.0, pulse);
      col += strip * inSafe * vec3(0.0, 0.75, 1.0) * (0.45 + pulse * 0.7);

      // amber dot lights
      float aDot = step(0.992, abs(sin(angle * 16.0 + 0.4)));
      float zDot = step(0.94, abs(sin(vWorld.z * 1.3)));
      col += aDot * zDot * inSafe * vec3(1.0, 0.55, 0.08) * 0.9;

      // scrolling chevrons on the floor
      float ground = smoothstep(0.7, 0.0, absAngle) * inSafe;
      float chev = abs(sin(vWorld.z * 0.85 - time * 5.0));
      col += ground * step(0.90, chev) * vec3(0.0, 0.85, 1.0) * 0.55;

      // orange warning glow at arc boundary
      float edgeDist = abs(absAngle - localArcH);
      col += smoothstep(0.14, 0.0, edgeDist) * vec3(1.0, 0.38, 0.0) * 1.1;

      // depth fade
      col *= 0.85 + 0.15 * smoothstep(80.0, 0.0, abs(vWorld.z - playerZ - 30.0));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.BackSide,
});

const tunnelGeo = new THREE.CylinderGeometry(TUNNEL_R, TUNNEL_R, TUNNEL_LEN, 80, 48, true);
tunnelGeo.rotateX(Math.PI / 2);
const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
scene.add(tunnel);

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0x6090ff, 0x281410, 0.55));
// Extra fill lights for chrome reflections
scene.add(new THREE.PointLight(0x0080ff, 2.5, 40));
{ const l = new THREE.PointLight(0xff4000, 1.8, 35); l.position.set(8, -8, 0); scene.add(l); }
const carLight = new THREE.PointLight(0x80ffff, 2.5, 22);
scene.add(carLight);
const tailLight = new THREE.PointLight(0xff5020, 0.9, 14);
scene.add(tailLight);

// ---- Car (chrome ball) ----
const carGroup = new THREE.Group();
const ballMat = new THREE.MeshStandardMaterial({
  color:           BALL_MAT.color,
  metalness:       BALL_MAT.metalness,
  roughness:       BALL_MAT.roughness,
  envMapIntensity: BALL_MAT.envMapIntensity,
  transparent:     BALL_MAT.transparent,
  opacity:         BALL_MAT.opacity,
  depthWrite:      BALL_MAT.depthWrite,
});
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 32), ballMat);
carGroup.add(ball);

// equator ring
const ringGeo = new THREE.TorusGeometry(0.92, 0.045, 8, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: BALL_MAT.ringColor, transparent: true, opacity: BALL_MAT.ringOpacity });
const equator = new THREE.Mesh(ringGeo, ringMat);
carGroup.add(equator);

// boost flame (single cone behind ball)
const flames = [];
{
  const fGeo = new THREE.ConeGeometry(0.28, 1.8, 10);
  fGeo.rotateX(Math.PI / 2);
  const f = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.7 }));
  f.position.set(0, 0, -1.4);
  flames.push(f); carGroup.add(f);
}
scene.add(carGroup);

// CubeCamera for live tunnel reflections on the chrome ball
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(BALL_MAT.reflectionRes, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);
ballMat.envMap = cubeRenderTarget.texture;

// ---- State ----

let physicsMode = true;  // physics steering is default; button toggles classic mode
let physicsForce = 0;
let restitutionCurrent = BALL_PHYS.restitution;
let materialDamp = 1.0;   // 1 = pełne odkształcenie, 0 = czyste toczenie (lerp gdy S/↓)
let jumpCooldown = 0;     // sekund do następnego skoku (reset przy lądowaniu)
let landingEvaluated = false;

let carTheta = 0;
let thetaVelocity = 0;
let radialOffset = 0, radialVelocity = 0;
let grounded = true;
let crashed = false, crashTimer = 0;
let tumbleRollAngle = 0, tumblePitchAngle = 0;
let tumbleRollVelocity = 0, tumblePitchVelocity = 0;

let cameraTheta = 0, cameraThetaVelocity = 0;
let cameraFovCurrent = 66, cameraBackDistanceCurrent = 13;
let cameraHeightCurrent = 4.0;
let dangerTimer = 0;

let carZ = 0, speed = CFG.baseSpeed;
const BASE_SPEED_START = 32;
let timeElapsed = 0;
let boost = 1, boostActive = false;
let score = 0, timeLeft = 60;
let gameRunning = false;
let flashAlpha = 0;
let totalDistance = 0;

const obstacles = [];

function currentBaseSpeed() {
  return BASE_SPEED_START + Math.min(timeElapsed, 60); // 32 → 92 over 60 s
}

// ---- Geometry helpers (kept for obstacle spawning) ----
function makeWedge(w, h, l) {
  const g = new THREE.BufferGeometry();
  const X = w / 2, Y = h, Z = l / 2;
  const v = new Float32Array([
    -X, 0, -Z,  X, 0, -Z,  X, 0,  Z,  -X, 0,  Z,
    -X, Y,  Z,  X, Y,  Z,
  ]);
  const idx = [0,2,1, 0,3,2, 0,5,1, 0,4,5, 3,4,5, 3,5,2, 0,4,3, 1,2,5];
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function placeOnTunnel(node, theta, z, hAbove) {
  const r = TUNNEL_R - hAbove;
  node.position.set(Math.sin(theta) * r, -Math.cos(theta) * r, z);
  node.rotation.set(0, 0, theta);
}
function shortAng(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---- Trick / score display ----
let trickHide = null;
function showTrick(name) {
  document.getElementById('trick-name').textContent = name;
  document.getElementById('trick-pts').textContent = '';
  const el = document.getElementById('trick-display');
  el.style.opacity = '1';
  if (trickHide) clearTimeout(trickHide);
  trickHide = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

// ---- Physics ----
function getBasis(theta) {
  return {
    surfaceOut: new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0),
    up:         new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0),
    right:      new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0),
    forward:    new THREE.Vector3(0, 0, 1),
  };
}

function evaluateLanding() {
  grounded = true;
}

function respawnAfterCrash() {
  carZ += 18;
  carTheta = 0; thetaVelocity = 0;
  radialOffset = 0; radialVelocity = 0;
  grounded = true; crashed = false; crashTimer = 0;
  tumbleRollAngle = 0; tumblePitchAngle = 0;
  tumbleRollVelocity = 0; tumblePitchVelocity = 0;
  showTrick('RESPAWN');
}

function updatePhysics(dt, left, right, jumpPressed, boostHeld) {
  if (crashed) {
    // tumble & respawn
    crashTimer -= dt;
    speed += (currentBaseSpeed() * 0.4 - speed) * 5 * dt;
    carZ += speed * dt;
    totalDistance += speed * dt;
    timeElapsed += dt;
    carTheta += thetaVelocity * 0.3 * dt;
    thetaVelocity *= Math.exp(-5 * dt);
    tumbleRollAngle += tumbleRollVelocity * dt;
    tumblePitchAngle += tumblePitchVelocity * dt;
    const tw = Math.PI * 2;
    carTheta = ((carTheta % tw) + tw) % tw;
    if (crashTimer <= 0) respawnAfterCrash();
    return;
  }

  const bSpeed = currentBaseSpeed();
  const targetSpeed = boostHeld && boost > 0.02 ? CFG.boostSpeed + (bSpeed - CFG.baseSpeed) : bSpeed;
  speed += (targetSpeed - speed) * CFG.acceleration * dt;
  if (boostHeld && boost > 0.02) {
    boost = Math.max(0, boost - CFG.boostDrain * dt);
    boostActive = true;
  } else {
    boost = Math.min(1, boost + CFG.boostRegen * dt);
    boostActive = false;
  }

  const dz = speed * dt;
  carZ += dz;
  totalDistance += dz;
  timeElapsed += dt;

  const rawSteer = (left ? 1 : 0) - (right ? 1 : 0);
  const hasInput = rawSteer !== 0;

  // Siła natychmiastowa — ale musi przezwyciężyć bezwładność masy
  // Gdy klawisz wciśnięty: brak tłumienia — siła walczy z pędem (czysta fizyka Newtona)
  // Gdy puszczony: inertiaDecay — kula stopniowo zwalnia
  physicsForce = rawSteer;

  const lateralFriction = hasInput ? 0 : BALL_PHYS.inertiaDecay;

  thetaVelocity += physicsForce * CFG.steerAcceleration * dt;
  thetaVelocity = THREE.MathUtils.clamp(thetaVelocity, -CFG.maxThetaVelocity, CFG.maxThetaVelocity);
  thetaVelocity *= Math.exp(-lateralFriction * dt);
  carTheta += thetaVelocity * dt;

  // ↓/S held: lerp restitution toward 0 + materiauł w stronę czystego toczenia
  const absorb = input.down;
  restitutionCurrent += ((absorb ? 0 : BALL_PHYS.restitution) - restitutionCurrent) * Math.min(1, 4 * dt);
  materialDamp       += ((absorb ? 0 : 1)                     - materialDamp)       * Math.min(1, 4 * dt);

  // Jump cooldown
  if (jumpCooldown > 0) jumpCooldown -= dt;

  // Jump: works any time as a radial impulse addition (even during bouncing)
  if (jumpPressed && !crashed && jumpCooldown <= 0) {
    radialVelocity = Math.max(radialVelocity, 0) + CFG.jumpImpulse;
    grounded = false;
    landingEvaluated = false;
    jumpCooldown = 2.0;  // 2s blokada następnego skoku
  }

  if (!grounded) {
    radialVelocity -= CFG.tunnelGravity * dt;

    // Micro-bounce damping: gdy blisko ściany i lecisz w dół → tłum drgania
    if (radialVelocity < 0 && radialOffset < BALL_PHYS.surfaceDampRadius) {
      radialVelocity *= Math.exp(-BALL_PHYS.surfaceDamp * dt);
    }

    radialOffset += radialVelocity * dt;
    if (radialOffset > CFG.maxRadialOffset) {
      radialOffset = CFG.maxRadialOffset;
      radialVelocity = Math.min(0, radialVelocity);
    }
    if (radialOffset <= 0) {
      const impact = -radialVelocity;  // positive = downward speed
      radialOffset = 0;
      // squashTimer skalowany przez materialDamp — gdy S trzymany, brak odkształcenia;
      // po puszczeniu S squashTimer rośnie razem z materialDamp → brak artefaktów
      squashTimer = BALL_PHYS.squashDuration * materialDamp;
      if (!landingEvaluated) {
        evaluateLanding();              // awards trick / crash; sets grounded=true
        landingEvaluated = true;
      }
      if (!crashed && impact * restitutionCurrent > BALL_PHYS.bounceThreshold) {
        radialVelocity = impact * restitutionCurrent;  // bounce
        grounded = false;
      } else {
        radialVelocity = 0;
        grounded = true;
      }
    }
  }

  const tw = Math.PI * 2;
  carTheta = ((carTheta % tw) + tw) % tw;
}

// ---- Car + camera rendering ----
let ballSpinAngle = 0;
let squashTimer = 0, prevGrounded = true, frameCount = 0;
function updateCarVisuals(dt) {
  frameCount++;
  const basis = getBasis(carTheta);
  const r = TUNNEL_R - CAR_OFF - radialOffset;
  const pos = new THREE.Vector3(
    basis.surfaceOut.x * (r - 0.65),
    basis.surfaceOut.y * (r - 0.65),
    carZ
  );
  carGroup.position.copy(pos);

  // base orientation: up = toward tunnel center
  const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
  carGroup.quaternion.setFromRotationMatrix(matrix);

  // Rolling spin: ball rotates around lateral axis as it moves forward
  ballSpinAngle += (speed / 0.9) * dt;  // r=0.9 → angular = v/r
  const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ballSpinAngle);
  const leanQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), thetaVelocity * 0.06);
  ball.quaternion.copy(spinQ).multiply(leanQ);

  // Squash/stretch: spike on landing (set by physics), stretch at speed
  // materialDamp = 1 normalne → 0 czyste toczenie (S/↓ wciśnięte)
  squashTimer = Math.max(0, squashTimer - dt);
  const sq = squashTimer / BALL_PHYS.squashDuration;             // 1→0
  const scaleY  = 1.0 - sq * BALL_PHYS.squashAmount  * materialDamp;
  const scaleXZ = 1.0 + sq * BALL_PHYS.stretchAmount * materialDamp;
  const speedStretch = 1.0 + Math.max(0, (speed - CFG.baseSpeed) / CFG.baseSpeed) * BALL_PHYS.speedStretch * materialDamp;
  ball.scale.set(scaleXZ, scaleY, scaleXZ * speedStretch);
  equator.scale.copy(ball.scale);

  // Tumble roll on crash
  if (crashed) {
    const rollQ = new THREE.Quaternion().setFromAxisAngle(basis.forward, tumbleRollAngle);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(basis.right, tumblePitchAngle);
    carGroup.quaternion.multiply(rollQ).multiply(pitchQ);
  }

  // Equator ring: pulse when airborne; amber when jump on cooldown; dim on ground
  const inAir = !grounded && !crashed;
  const jumpReady = jumpCooldown <= 0;
  equator.material.opacity = inAir
    ? 0.55 + 0.15 * Math.sin(Date.now() * 0.015)
    : (!jumpReady && grounded ? 0.45 + 0.25 * Math.sin(Date.now() * 0.008) : 0.15);
  equator.material.color.setHex(
    inAir ? 0x80ffff
    : (!jumpReady && grounded ? 0xff8800   // pomaranczowy = cooldown aktywny
    : 0x00ffcc)                           // normalny zielony = gotowy do skoku
  );

  carLight.position.set(
    basis.surfaceOut.x * (r - 2),
    basis.surfaceOut.y * (r - 2),
    carZ + 1.5
  );
  carLight.intensity = boostActive ? 3.5 : 2.0;
  tailLight.position.set(basis.surfaceOut.x * r, basis.surfaceOut.y * r, carZ - 1.5);
  tailLight.intensity = boostActive ? 2.1 : 0.7;

  const fS = boostActive ? 2.0 : 0.0;
  flames.forEach(f => {
    f.visible = boostActive;
    f.scale.z = fS + Math.random() * 0.25;
    f.material.opacity = 0.85;
    f.material.color.setHex(0x80ffff);
  });

  // Live tunnel reflection: update cubeCamera every 10 frames
  if (frameCount % 10 === 0) {
    cubeCamera.position.copy(carGroup.position);
    carGroup.visible = false;
    cubeCamera.update(renderer, scene);
    carGroup.visible = true;
  }
}

// Camera spring constants — upgraded from POC tunnel-racer-modular
const CAM_SPRING   = 52;   // stiffer than before (was 26) → camera follows quicker
const CAM_DAMP     = 13.5; // more damping → no oscillation
const CAM_MAX_VEL  = 4.4;  // faster ceiling

// FOV config — asymmetric transition (enter slow = dramatic, exit fast = snappy)
const CAM_FOV_NORMAL   = 66;   // deg normal view
const CAM_FOV_BOOST    = 120;  // deg extreme boost view
const CAM_FOV_ENTER_S  = 3.0;  // seconds to reach boost FOV
const CAM_FOV_EXIT_S   = 1.2;  // seconds to return to normal

// Camera height from wall & back-distance
const CAM_HEIGHT_NORMAL = 4.0;  // m from wall to camera
const CAM_HEIGHT_BOOST  = 2.0;  // during boost: closer to wall = tunnel feels bigger
const CAM_DIST_NORMAL   = 13;
const CAM_DIST_FORWARD  = 19;   // ↑ held: pull back, see more ahead
const CAM_DIST_BACK     = 9;    // ↓ held: zoom in (cinematic brake)

// Constant-rate lerp helper (from POC) — more predictable than exp lerp
function moveToward(current, target, step) {
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

function updateCamera(dt) {
  // spring-damper on cameraTheta
  let delta = carTheta - cameraTheta;
  const tw = Math.PI * 2;
  while (delta > Math.PI) delta -= tw;
  while (delta < -Math.PI) delta += tw;
  const spring = delta * CAM_SPRING;
  const damp   = cameraThetaVelocity * CAM_DAMP;
  cameraThetaVelocity += (spring - damp) * dt;
  cameraThetaVelocity = THREE.MathUtils.clamp(cameraThetaVelocity, -CAM_MAX_VEL, CAM_MAX_VEL);
  cameraTheta += cameraThetaVelocity * dt;
  cameraTheta = ((cameraTheta % tw) + tw) % tw;

  // FOV: asymmetric speed — slow enter (dramatic buildup), fast exit (snap back)
  const fovTarget = boostActive ? CAM_FOV_BOOST : CAM_FOV_NORMAL;
  const fovTotalDelta = Math.abs(CAM_FOV_BOOST - CAM_FOV_NORMAL);
  const fovStep = (boostActive ? fovTotalDelta / CAM_FOV_ENTER_S : fovTotalDelta / CAM_FOV_EXIT_S) * dt;
  cameraFovCurrent = moveToward(cameraFovCurrent, fovTarget, fovStep);
  if (Math.abs(camera.fov - cameraFovCurrent) > 0.01) {
    camera.fov = cameraFovCurrent;
    camera.updateProjectionMatrix();
  }

  // Camera height: pulls toward wall during boost (tunnel feels larger/faster)
  const hTarget = boostActive ? CAM_HEIGHT_BOOST : CAM_HEIGHT_NORMAL;
  const hStep = (Math.abs(CAM_HEIGHT_NORMAL - CAM_HEIGHT_BOOST) /
    (boostActive ? 3.0 : 1.2)) * dt;
  cameraHeightCurrent = moveToward(cameraHeightCurrent, hTarget, hStep);

  // Distance: ↑ = pull back (see ahead), ↓ = zoom in (brake/absorb)
  const distTarget = input.up ? CAM_DIST_FORWARD : input.down ? CAM_DIST_BACK : CAM_DIST_NORMAL;
  cameraBackDistanceCurrent += (distTarget - cameraBackDistanceCurrent) *
    (1 - Math.exp(-3.2 * dt));

  const camSurf = new THREE.Vector3(Math.sin(cameraTheta), -Math.cos(cameraTheta), 0);
  const camUp   = camSurf.clone().multiplyScalar(-1);
  const camR    = TUNNEL_R - cameraHeightCurrent;

  camera.up.copy(camUp);
  camera.position.set(
    camSurf.x * camR,
    camSurf.y * camR,
    carZ - cameraBackDistanceCurrent
  );
  // Look at actual car position (from POC), not surface projection
  camera.lookAt(carGroup.position.x, carGroup.position.y, carZ + 20);
}

function updateHUD() {
  document.getElementById('score').textContent = Math.floor(score).toLocaleString();
  const m = Math.floor(timeLeft / 60);
  const s = Math.floor(timeLeft % 60);
  document.getElementById('time').textContent = m + ':' + (s < 10 ? '0' : '') + s;
  document.getElementById('speed').textContent = Math.floor(speed * 3.6);
  document.getElementById('boost-fill').style.width = (boost * 100).toFixed(0) + '%';
  document.getElementById('dist').textContent = Math.floor(totalDistance) + ' m';
}

function applyFlash(dt) {
  flashAlpha = Math.max(0, flashAlpha - dt * 2.2);
  flashEl.style.background = flashAlpha > 0
    ? 'rgba(224, 32, 64, ' + (flashAlpha * 0.5).toFixed(3) + ')'
    : 'transparent';
}

function applyDanger() {
  if (dangerTimer > 0 && gameRunning) {
    dangerEl.style.display = 'flex';
    const remaining = (DANGER_TIMEOUT - dangerTimer).toFixed(1);
    dangerEl.textContent = '\u26a0 CZARNA STREFA! ' + remaining + 's';
    const intensity = dangerTimer / DANGER_TIMEOUT;
    dangerEl.style.opacity = String(0.7 + 0.3 * Math.sin(Date.now() / (120 - 80 * intensity)));
  } else {
    dangerEl.style.display = 'none';
  }
}

function tick(dt) {
  if (gameRunning && !crashed) {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endGame(false); return; }
  }

  const left  = !!(input.left);
  const right = !!(input.right);
  updatePhysics(dt, left, right, input.jumpConsumed, input.boost);
  if (input.jumpConsumed) input.jumpConsumed = false;

  updateCarVisuals(dt);

  if (gameRunning && !crashed) {
    // Normalize angle for arc check (arc is centered at 0, and carTheta is in [0,2π])
    const tNorm = carTheta > Math.PI ? carTheta - Math.PI * 2 : carTheta;
    const arcH = getArcHalfAngle(carZ);
    if (Math.abs(tNorm) > arcH) {
      dangerTimer += dt;
      if (dangerTimer >= DANGER_TIMEOUT) { endGame(true); return; }
    } else {
      dangerTimer = Math.max(0, dangerTimer - dt * 4);
    }
    score += speed * dt * 0.18;
    updateHUD();
  }

  applyFlash(dt);
  applyDanger();
  updateCamera(dt);
}

// ---- Input ----
const input = { left: false, right: false, up: false, down: false, boost: false, jumpConsumed: false };
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Shift','a','A','d','D','s','S'].includes(e.key)) e.preventDefault();
  if (keys[e.key]) return;
  keys[e.key] = true;

  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left  = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
  if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') input.up   = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = true;
  if (e.key === 'Shift') input.boost = true;
  if (e.key === ' ' && gameRunning && !crashed) input.jumpConsumed = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') input.up   = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = false;
  if (e.key === 'Shift') input.boost = false;
});

// ---- Main loop ----
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  tunnelMat.uniforms.time.value = t / 1000;
  tunnelMat.uniforms.playerZ.value = carZ;
  tunnel.position.z = carZ;

  tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---- Game flow ----
function startGame() {
  carTheta = 0; thetaVelocity = 0; cameraTheta = 0; cameraThetaVelocity = 0; carZ = 0;
  radialOffset = 0; radialVelocity = 0; grounded = true;
  landingEvaluated = false; physicsForce = 0;
  crashed = false; crashTimer = 0;
  tumbleRollAngle = 0; tumblePitchAngle = 0; tumbleRollVelocity = 0; tumblePitchVelocity = 0;
  speed = BASE_SPEED_START; boost = 1; boostActive = false;
  score = 0; timeLeft = 60; timeElapsed = 0;
  flashAlpha = 0; totalDistance = 0; dangerTimer = 0;
  cameraFovCurrent = 66; cameraBackDistanceCurrent = 13; cameraHeightCurrent = 4.0;
  restitutionCurrent = BALL_PHYS.restitution;
  materialDamp = 1.0;
  jumpCooldown = 0;
  input.left = false; input.right = false; input.up = false; input.down = false; input.boost = false; input.jumpConsumed = false;

  for (const o of obstacles) {
    scene.remove(o);
    o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  }
  obstacles.length = 0;

  overlay.style.display = 'none';
  gameRunning = true;
}

function endGame(fell) {
  gameRunning = false;
  const reason = fell ? 'WYPADŁEŚ Z TUNELU' : 'koniec czasu';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="end-card">
      <div class="end-label">${reason}</div>
      <div class="end-score">${Math.floor(score).toLocaleString()}</div>
      <div class="end-stat">${Math.floor(totalDistance)} m</div>
      <button class="btn" id="restart-btn" style="margin-top: 14px;">zagraj jeszcze</button>
    </div>
  `;
  document.getElementById('restart-btn').addEventListener('click', startGame);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('mode-btn').addEventListener('click', () => {
  physicsMode = !physicsMode;
  const btn = document.getElementById('mode-btn');
  btn.textContent = physicsMode ? 'PHYSICS MODE' : 'CLASSIC MODE';
  btn.style.background = physicsMode ? '#ff8800' : '';
  btn.style.color = physicsMode ? '#0a0400' : '';
  document.getElementById('mode-indicator').textContent = physicsMode ? 'PHYSICS' : '';
});
// init button state to match default physicsMode=true
{
  const btn = document.getElementById('mode-btn');
  btn.textContent = 'PHYSICS MODE';
  btn.style.background = '#ff8800';
  btn.style.color = '#0a0400';
  document.getElementById('mode-indicator').textContent = 'PHYSICS';
}
requestAnimationFrame(loop);
