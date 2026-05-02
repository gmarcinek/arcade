import * as THREE from 'three';

const CONFIG = {
  tunnelRadius: 12,
  sectionLength: 900,
  totalDistance: 3200,
  baseSpeed: 32,
  boostSpeed: 54,
  acceleration: 6,
  steerAcceleration: 4.5,
  maxThetaVelocity: 2.4,
  groundedFriction: 7.5,
  airFriction: 1.2,
  airControl: 0.35,
  jumpImpulse: 13,
  tunnelGravity: 36,
  maxRadialOffset: 7,
  boostDrain: 0.55,
  boostRegen: 0.28,
  timerStart: 65,
};

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const touchRoot = document.getElementById('touchControls');
const isTouch = window.matchMedia('(pointer: coarse)').matches;

hudRoot.innerHTML = `
  <div class="tt-hud">
    <div class="tt-topbar">
      <div class="tt-panel">
        <div class="tt-title">TRON TUNEL 2</div>
        <div class="tt-sub">
          Engine oparty na physics-first POC. Auto jedzie po wewnętrznej ścianie tunelu,
          skacze radialnie do środka i wraca na powierzchnię. Omiń bramy, zbieraj punkty i dojedź do końca przed czasem.
        </div>
      </div>

      <div class="tt-panel tt-metrics">
        <div>
          <div class="tt-metric-label">Speed</div>
          <div class="tt-metric-value" data-speed>0 km/h</div>
        </div>
        <div>
          <div class="tt-metric-label">Time</div>
          <div class="tt-metric-value" data-time>00:00</div>
        </div>
        <div>
          <div class="tt-metric-label">Score</div>
          <div class="tt-metric-value" data-score>0</div>
        </div>
        <div>
          <div class="tt-metric-label">Theta</div>
          <div class="tt-metric-value" data-theta>0.00</div>
        </div>
        <div>
          <div class="tt-metric-label">Combo</div>
          <div class="tt-metric-value" data-combo>x1</div>
        </div>
        <div>
          <div class="tt-metric-label">Distance</div>
          <div class="tt-metric-value" data-distance>0m</div>
        </div>
      </div>
    </div>

    <div class="tt-event">
      <div class="tt-event-label">Event</div>
      <div class="tt-event-title" data-event-title>Ready</div>
      <div class="tt-event-score" data-event-score>+0</div>
    </div>

    <div class="tt-bottom">
      <div class="tt-panel tt-controls">
        <span class="tt-key">A</span>/<span class="tt-key">←</span> skręt,
        <span class="tt-key">D</span>/<span class="tt-key">→</span> skręt,
        <span class="tt-key">Space</span> skok radialny,
        <span class="tt-key">Shift</span> boost,
        <span class="tt-key">R</span> restart.
        <br />Bramy z wycięciem wymagają odpowiedniego kąta. Pełne bramy trzeba przeskoczyć. Zielone pierścienie dają czas i wynik.
      </div>

      <div class="tt-panel tt-bar-wrap">
        <div class="tt-bar-label"><span>Boost</span><span data-boost-text>100%</span></div>
        <div class="tt-bar"><div class="tt-bar-fill" data-boost-fill></div></div>
      </div>
    </div>
  </div>
  <div class="tt-note" data-note>Reset</div>
`;

touchRoot.innerHTML = `
  <div class="tt-touch">
    <button data-touch="left">Left</button>
    <button data-touch="right">Right</button>
    <button data-touch="jump">Jump</button>
    <button data-touch="boost">Boost</button>
  </div>
`;

const overlay = document.createElement('div');
overlay.className = 'tt-overlay';
overlay.innerHTML = `
  <div class="tt-overlay-card">
    <h1>TRON TUNEL 2</h1>
    <p>
      Druga wersja oparta na debugowym POC. Zachowuje physics-first ruch po cylindrze i dokłada pełną rundę arcade:
      przeszkody, pickupy czasu, combo i finish line.
    </p>
    <div class="tt-grid">
      <div><strong>Steer</strong><span>Obracaj się po obwodzie tunelu.</span></div>
      <div><strong>Radial Jump</strong><span>Skok od ściany do środka tunelu.</span></div>
      <div><strong>Boost</strong><span>Większa prędkość i lepszy przelot przez sekcje.</span></div>
    </div>
    <button class="tt-button" data-start>Start Run</button>
  </div>
`;
document.body.appendChild(overlay);

const ui = {
  speed: hudRoot.querySelector('[data-speed]'),
  time: hudRoot.querySelector('[data-time]'),
  score: hudRoot.querySelector('[data-score]'),
  theta: hudRoot.querySelector('[data-theta]'),
  combo: hudRoot.querySelector('[data-combo]'),
  distance: hudRoot.querySelector('[data-distance]'),
  eventTitle: hudRoot.querySelector('[data-event-title]'),
  eventScore: hudRoot.querySelector('[data-event-score]'),
  boostText: hudRoot.querySelector('[data-boost-text]'),
  boostFill: hudRoot.querySelector('[data-boost-fill]'),
  note: hudRoot.querySelector('[data-note]'),
};

const input = {
  left: false,
  right: false,
  boost: false,
  jump: false,
  jumpConsumed: false,
};

const state = {
  z: 0,
  theta: 0,
  zVelocity: CONFIG.baseSpeed,
  thetaVelocity: 0,
  radialOffset: 0,
  radialVelocity: 0,
  grounded: true,
  boost: 1,
  timeLeft: CONFIG.timerStart,
  score: 0,
  combo: 1,
  playing: false,
  finished: false,
  eventTimer: 0,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07070b, 0.018);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1200);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const mainLight = new THREE.DirectionalLight(0xffffff, 1.3);
mainLight.position.set(2, 5, -6);
scene.add(mainLight);

const carLight = new THREE.PointLight(0x45ff9a, 2.0, 18);
scene.add(carLight);

const accentLight = new THREE.PointLight(0x4ed8ff, 3.5, 24);
scene.add(accentLight);

function createTunnel(radius, length, color, opacity, wireframe) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 96, 48, true);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    wireframe,
    side: THREE.BackSide,
    transparent: true,
    opacity,
  });
  return new THREE.Mesh(geometry, material);
}

const tunnel = createTunnel(CONFIG.tunnelRadius, CONFIG.sectionLength, 0x171925, 0.54, true);
const tunnelSkin = createTunnel(CONFIG.tunnelRadius + 0.02, CONFIG.sectionLength, 0x080910, 0.42, false);
scene.add(tunnel, tunnelSkin);

const laneGroup = new THREE.Group();
const ringGroup = new THREE.Group();
const gameplayGroup = new THREE.Group();
scene.add(laneGroup, ringGroup, gameplayGroup);

function addLaneLine(theta, color, width = 0.05) {
  const radius = CONFIG.tunnelRadius - 0.04;
  const surfaceOut = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0);
  const up = surfaceOut.clone().multiplyScalar(-1);
  const right = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward);

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.035, CONFIG.sectionLength),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.74 }),
  );
  line.position.set(surfaceOut.x * radius, surfaceOut.y * radius, CONFIG.sectionLength * 0.5);
  line.quaternion.setFromRotationMatrix(matrix);
  laneGroup.add(line);
}

for (let index = 0; index < 12; index += 1) {
  addLaneLine((index / 12) * Math.PI * 2, index % 3 === 0 ? 0x45ff9a : 0x333a55, index % 3 === 0 ? 0.09 : 0.035);
}

function createRing(z) {
  const curve = new THREE.EllipseCurve(0, 0, CONFIG.tunnelRadius, CONFIG.tunnelRadius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(128).map(point => new THREE.Vector3(point.x, point.y, 0));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x45ff9a, transparent: true, opacity: 0.16 });
  const line = new THREE.LineLoop(geometry, material);
  line.position.z = z;
  return line;
}

for (let z = 0; z < CONFIG.sectionLength; z += 24) {
  ringGroup.add(createRing(z));
}

function createDebugCar() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.64, 3.25),
    new THREE.MeshStandardMaterial({
      color: 0x45ff9a,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x062a15,
    }),
  );
  body.position.y = 0.52;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.52, 1.05),
    new THREE.MeshStandardMaterial({
      color: 0xb8ffe0,
      roughness: 0.22,
      metalness: 0.2,
      emissive: 0x0c2c20,
    }),
  );
  cabin.position.set(0, 1.04, -0.18);
  group.add(cabin);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.18, 0.44),
    new THREE.MeshBasicMaterial({ color: 0xd9fff0 }),
  );
  nose.position.set(0, 0.76, 1.68);
  group.add(nose);

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.16, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xff4365 }),
  );
  tail.position.set(0, 0.72, -1.68);
  group.add(tail);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.75, metalness: 0.15 });
  const wheelGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.22, 18);
  wheelGeometry.rotateZ(Math.PI / 2);

  for (const x of [-1.02, 1.02]) {
    for (const z of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, 0.27, z);
      group.add(wheel);
    }
  }

  return group;
}

const car = createDebugCar();
scene.add(car);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.25, 32),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, side: THREE.DoubleSide }),
);
scene.add(shadow);

const obstacles = [];
const pickups = [];
let nextSpawnZ = 120;
let cameraTheta = 0;
let noteTimer = 0;
let lastTime = performance.now();

function showNote(text) {
  ui.note.textContent = text;
  ui.note.classList.add('visible');
  noteTimer = 0.42;
}

function showEvent(title, score, color = '#ffd84d') {
  ui.eventTitle.textContent = title;
  ui.eventScore.textContent = score;
  ui.eventScore.style.color = color;
  state.eventTimer = 1.5;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function resetState() {
  state.z = 0;
  state.theta = 0;
  state.zVelocity = CONFIG.baseSpeed;
  state.thetaVelocity = 0;
  state.radialOffset = 0;
  state.radialVelocity = 0;
  state.grounded = true;
  state.boost = 1;
  state.timeLeft = CONFIG.timerStart;
  state.score = 0;
  state.combo = 1;
  state.finished = false;
  cameraTheta = 0;
  nextSpawnZ = 120;

  for (const entry of [...obstacles, ...pickups]) {
    gameplayGroup.remove(entry.mesh);
  }
  obstacles.length = 0;
  pickups.length = 0;

  showNote('Reset');
  showEvent('Ready', '+0', '#72ffe8');
}

function getBasis(theta) {
  const surfaceOut = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0);
  const up = surfaceOut.clone().multiplyScalar(-1);
  const right = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
  const forward = new THREE.Vector3(0, 0, 1);
  return { surfaceOut, up, right, forward };
}

function getCarTransform() {
  const { surfaceOut, up, right, forward } = getBasis(state.theta);
  const radius = CONFIG.tunnelRadius - state.radialOffset;
  const position = new THREE.Vector3(surfaceOut.x * radius, surfaceOut.y * radius, state.z);
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return { position, quaternion, up, right, forward, surfaceOut };
}

function buildOpenGate(thetaCenter, width, z) {
  const group = new THREE.Group();
  const segmentCount = 20;
  const arcSpan = Math.PI * 2 - width;
  const material = new THREE.MeshBasicMaterial({ color: 0xff4365, transparent: true, opacity: 0.9 });
  for (let index = 0; index < segmentCount; index += 1) {
    const localTheta = thetaCenter + width * 0.5 + (index / segmentCount) * arcSpan;
    const basis = getBasis(localTheta);
    const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.85), material);
    bar.position.set(
      basis.surfaceOut.x * (CONFIG.tunnelRadius - 0.12),
      basis.surfaceOut.y * (CONFIG.tunnelRadius - 0.12),
      z,
    );
    bar.quaternion.setFromRotationMatrix(matrix);
    group.add(bar);
  }
  return group;
}

function buildJumpGate(z) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xff4365, transparent: true, opacity: 0.84 });
  for (let index = 0; index < 18; index += 1) {
    const theta = (index / 18) * Math.PI * 2;
    const basis = getBasis(theta);
    const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.95), material);
    block.position.set(
      basis.surfaceOut.x * (CONFIG.tunnelRadius - 1.1),
      basis.surfaceOut.y * (CONFIG.tunnelRadius - 1.1),
      z,
    );
    block.quaternion.setFromRotationMatrix(matrix);
    group.add(block);
  }
  return group;
}

function buildPickup(theta, z) {
  const basis = getBasis(theta);
  const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.12, 12, 24),
    new THREE.MeshBasicMaterial({ color: 0x45ff9a, transparent: true, opacity: 0.95 }),
  );
  ring.position.set(
    basis.surfaceOut.x * (CONFIG.tunnelRadius - 1.45),
    basis.surfaceOut.y * (CONFIG.tunnelRadius - 1.45),
    z,
  );
  ring.quaternion.setFromRotationMatrix(matrix);
  return ring;
}

function spawnGameplayObjects() {
  while (nextSpawnZ < state.z + 420 && nextSpawnZ < CONFIG.totalDistance) {
    const roll = Math.random();
    if (roll < 0.5) {
      const thetaCenter = Math.random() * Math.PI * 2;
      const width = THREE.MathUtils.degToRad(72 + Math.random() * 20);
      const mesh = buildOpenGate(thetaCenter, width, nextSpawnZ);
      gameplayGroup.add(mesh);
      obstacles.push({ type: 'theta-gate', z: nextSpawnZ, thetaCenter, width, mesh, resolved: false });
    } else {
      const mesh = buildJumpGate(nextSpawnZ);
      gameplayGroup.add(mesh);
      obstacles.push({ type: 'jump-gate', z: nextSpawnZ, mesh, resolved: false });
    }

    if (Math.random() > 0.35) {
      const theta = Math.random() * Math.PI * 2;
      const pickupMesh = buildPickup(theta, nextSpawnZ + 10 + Math.random() * 6);
      gameplayGroup.add(pickupMesh);
      pickups.push({ z: nextSpawnZ + 10, theta, mesh: pickupMesh, collected: false });
    }

    nextSpawnZ += 42 + Math.random() * 18;
  }
}

function getFrameInput() {
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const jumpPressed = input.jump && !input.jumpConsumed;
  if (jumpPressed) input.jumpConsumed = true;
  return { steer, jumpPressed, boostHeld: input.boost };
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function angleDistance(a, b) {
  let delta = normalizeAngle(a) - normalizeAngle(b);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function addScore(points, label, color = '#ffd84d') {
  const total = Math.round(points * state.combo);
  state.score += total;
  showEvent(label, `+${total}`, color);
}

function crash(reason) {
  state.combo = 1;
  state.timeLeft = Math.max(0, state.timeLeft - 6);
  showEvent(reason, '-6s', '#ff4365');
  showNote(reason);
}

function updatePhysics(frameInput, dt) {
  const cappedDt = Math.min(dt, 1 / 30);
  const canBoost = frameInput.boostHeld && state.boost > 0.02;
  const targetSpeed = canBoost ? CONFIG.boostSpeed : CONFIG.baseSpeed;

  state.zVelocity += (targetSpeed - state.zVelocity) * CONFIG.acceleration * cappedDt;
  state.z += state.zVelocity * cappedDt;

  if (canBoost) {
    state.boost = Math.max(0, state.boost - CONFIG.boostDrain * cappedDt);
  } else {
    state.boost = Math.min(1, state.boost + CONFIG.boostRegen * cappedDt);
  }

  const grip = state.grounded ? 1 : CONFIG.airControl;
  const friction = state.grounded ? CONFIG.groundedFriction : CONFIG.airFriction;

  state.thetaVelocity += frameInput.steer * CONFIG.steerAcceleration * grip * cappedDt;
  state.thetaVelocity = THREE.MathUtils.clamp(state.thetaVelocity, -CONFIG.maxThetaVelocity, CONFIG.maxThetaVelocity);
  state.thetaVelocity *= Math.exp(-friction * cappedDt);
  state.theta += state.thetaVelocity * cappedDt;

  if (frameInput.jumpPressed && state.grounded) {
    state.radialVelocity = CONFIG.jumpImpulse;
    state.grounded = false;
    showNote('Radial Jump');
  }

  if (!state.grounded) {
    state.radialVelocity -= CONFIG.tunnelGravity * cappedDt;
    state.radialOffset += state.radialVelocity * cappedDt;

    if (state.radialOffset > CONFIG.maxRadialOffset) {
      state.radialOffset = CONFIG.maxRadialOffset;
      state.radialVelocity = Math.min(0, state.radialVelocity);
    }

    if (state.radialOffset <= 0) {
      state.radialOffset = 0;
      state.radialVelocity = 0;
      state.grounded = true;
      showNote('Landing');
    }
  }

  state.theta = normalizeAngle(state.theta);
}

function updateGameplay(dt) {
  if (!state.playing || state.finished) return;

  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.score += dt * state.zVelocity * 0.9;

  spawnGameplayObjects();

  for (const obstacle of obstacles) {
    if (obstacle.resolved) continue;
    const dz = obstacle.z - state.z;
    if (Math.abs(dz) < 1.2) {
      if (obstacle.type === 'theta-gate') {
        const clear = angleDistance(state.theta, obstacle.thetaCenter) < obstacle.width * 0.5;
        if (clear) {
          obstacle.resolved = true;
          state.combo = Math.min(8, state.combo + 1);
          addScore(180, 'Clean Gate', '#72ffe8');
        } else {
          obstacle.resolved = true;
          crash('Bad Angle');
        }
      }

      if (obstacle.type === 'jump-gate') {
        if (state.radialOffset > 2.2) {
          obstacle.resolved = true;
          state.combo = Math.min(8, state.combo + 1);
          addScore(220, 'Jump Gate', '#72ffe8');
        } else {
          obstacle.resolved = true;
          crash('Gate Collision');
        }
      }
    }
  }

  for (const pickup of pickups) {
    if (pickup.collected) continue;
    const dz = Math.abs(pickup.z - state.z);
    if (dz < 1.6 && angleDistance(state.theta, pickup.theta) < 0.28) {
      pickup.collected = true;
      pickup.mesh.visible = false;
      state.timeLeft += 4;
      state.combo = Math.min(8, state.combo + 1);
      addScore(140, 'Time Ring', '#45ff9a');
      showNote('+4s');
    }
  }

  for (let index = obstacles.length - 1; index >= 0; index -= 1) {
    if (obstacles[index].z < state.z - 30) {
      gameplayGroup.remove(obstacles[index].mesh);
      obstacles.splice(index, 1);
    }
  }

  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    if (pickups[index].z < state.z - 30 || pickups[index].collected) {
      gameplayGroup.remove(pickups[index].mesh);
      pickups.splice(index, 1);
    }
  }

  if (state.z >= CONFIG.totalDistance) {
    finishRun(true);
  } else if (state.timeLeft <= 0) {
    finishRun(false);
  }
}

function dampAngle(current, target, lambda, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function updateCamera(carTransform, dt) {
  cameraTheta = dampAngle(cameraTheta, state.theta, 5.5, dt);
  const cameraSurfaceOut = new THREE.Vector3(Math.sin(cameraTheta), -Math.cos(cameraTheta), 0);
  const cameraUp = cameraSurfaceOut.clone().multiplyScalar(-1);

  camera.position.set(
    cameraSurfaceOut.x * (CONFIG.tunnelRadius - 1.15),
    cameraSurfaceOut.y * (CONFIG.tunnelRadius - 1.15),
    state.z - 17.5,
  );

  camera.up.copy(cameraUp);
  camera.lookAt(carTransform.position.x, carTransform.position.y, state.z + 21);
}

function updateDebugVisuals(carTransform) {
  car.position.copy(carTransform.position);
  car.quaternion.copy(carTransform.quaternion);

  carLight.position.copy(carTransform.position).addScaledVector(carTransform.up, 2.4).addScaledVector(carTransform.forward, -1.2);
  accentLight.position.copy(carTransform.position).addScaledVector(carTransform.up, 1.2).addScaledVector(carTransform.forward, 3.5);
  carLight.intensity = input.boost && state.boost > 0.02 ? 4.2 : 1.7;

  const groundBasis = getBasis(state.theta);
  const groundPoint = new THREE.Vector3(
    groundBasis.surfaceOut.x * CONFIG.tunnelRadius,
    groundBasis.surfaceOut.y * CONFIG.tunnelRadius,
    state.z,
  );
  const shadowMatrix = new THREE.Matrix4().makeBasis(groundBasis.right, groundBasis.forward, groundBasis.up);
  shadow.position.copy(groundPoint).addScaledVector(groundBasis.up, 0.012);
  shadow.quaternion.setFromRotationMatrix(shadowMatrix);
  shadow.scale.setScalar(1 + state.radialOffset * 0.08);
  shadow.material.opacity = THREE.MathUtils.clamp(0.36 - state.radialOffset * 0.035, 0.08, 0.36);

  const cycle = Math.floor(state.z / CONFIG.sectionLength);
  const baseZ = cycle * CONFIG.sectionLength;
  tunnel.position.z = baseZ + CONFIG.sectionLength * 0.5;
  tunnelSkin.position.z = baseZ + CONFIG.sectionLength * 0.5;
  laneGroup.position.z = baseZ;
  ringGroup.position.z = baseZ;
}

function updateHud(dt) {
  ui.speed.textContent = `${Math.round(state.zVelocity * 3.6)} km/h`;
  ui.time.textContent = formatTime(state.timeLeft);
  ui.score.textContent = Math.round(state.score).toLocaleString('en-US');
  ui.theta.textContent = state.theta.toFixed(2);
  ui.combo.textContent = `x${state.combo}`;
  ui.distance.textContent = `${Math.min(CONFIG.totalDistance, Math.round(state.z))}m`;
  ui.boostText.textContent = `${Math.round(state.boost * 100)}%`;
  ui.boostFill.style.transform = `scaleX(${state.boost.toFixed(3)})`;

  if (state.eventTimer > 0) {
    state.eventTimer = Math.max(0, state.eventTimer - dt);
  } else {
    ui.eventTitle.textContent = state.grounded ? 'Stable Line' : 'In Air';
    ui.eventScore.textContent = state.grounded ? '+0' : `Lift ${state.radialOffset.toFixed(1)}`;
    ui.eventScore.style.color = state.grounded ? '#ffd84d' : '#72ffe8';
  }

  if (noteTimer > 0) {
    noteTimer = Math.max(0, noteTimer - dt);
    if (noteTimer === 0) ui.note.classList.remove('visible');
  }
}

function finishRun(victory) {
  if (state.finished) return;
  state.finished = true;
  state.playing = false;

  overlay.innerHTML = `
    <div class="tt-overlay-card">
      <h1>${victory ? 'Finish' : 'Time Out'}</h1>
      <p>${victory ? 'Dojechałeś do końca trasy.' : 'Nie zdążyłeś przed końcem odliczania.'}</p>
      <div class="tt-grid">
        <div><strong>Score</strong><span>${Math.round(state.score).toLocaleString('en-US')}</span></div>
        <div><strong>Distance</strong><span>${Math.round(state.z)}m</span></div>
        <div><strong>Combo</strong><span>x${state.combo}</span></div>
      </div>
      <button class="tt-button" data-restart>Restart Run</button>
    </div>
  `;
  overlay.style.display = 'grid';
  overlay.querySelector('[data-restart]').addEventListener('click', () => {
    resetState();
    overlay.innerHTML = '';
    window.location.reload();
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;

  if (state.playing && !state.finished) {
    updatePhysics(getFrameInput(), dt);
    updateGameplay(dt);
  }

  const transform = getCarTransform();
  updateDebugVisuals(transform);
  updateCamera(transform, dt);
  updateHud(dt);

  renderer.render(scene, camera);
}

function setKey(code, pressed) {
  if (code === 'ArrowLeft' || code === 'KeyA') input.left = pressed;
  if (code === 'ArrowRight' || code === 'KeyD') input.right = pressed;
  if (code === 'ShiftLeft' || code === 'ShiftRight') input.boost = pressed;
  if (code === 'Space') {
    input.jump = pressed;
    if (!pressed) input.jumpConsumed = false;
  }
}

window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyA', 'KeyD'].includes(event.code)) {
    event.preventDefault();
  }
  setKey(event.code, true);
  if (event.code === 'KeyR') resetState();
}, { passive: false });

window.addEventListener('keyup', event => {
  setKey(event.code, false);
});

for (const button of touchRoot.querySelectorAll('[data-touch]')) {
  const touchType = button.getAttribute('data-touch');
  const start = event => {
    event.preventDefault();
    if (touchType === 'left') input.left = true;
    if (touchType === 'right') input.right = true;
    if (touchType === 'jump') {
      input.jump = true;
      input.jumpConsumed = false;
    }
    if (touchType === 'boost') input.boost = true;
  };
  const end = event => {
    event.preventDefault();
    if (touchType === 'left') input.left = false;
    if (touchType === 'right') input.right = false;
    if (touchType === 'jump') {
      input.jump = false;
      input.jumpConsumed = false;
    }
    if (touchType === 'boost') input.boost = false;
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('pointerleave', end);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

overlay.querySelector('[data-start]').addEventListener('click', async () => {
  if (isTouch) {
    try {
      await document.documentElement.requestFullscreen?.();
      await screen.orientation?.lock?.('landscape');
    } catch {
    }
  }
  overlay.style.display = 'none';
  state.playing = true;
  lastTime = performance.now();
  showNote('Go');
});

resetState();
requestAnimationFrame(animate);