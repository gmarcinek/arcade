import * as THREE from 'three';

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const touchRoot = document.getElementById('touchControls');
const isTouch = window.matchMedia('(pointer: coarse)').matches;

hudRoot.innerHTML = `
  <div class="tt-shell">
    <div class="tt-corner tt-left">
      <div>
        <span class="tt-label">Score</span>
        <span class="tt-value" data-score>0</span>
      </div>
      <div>
        <span class="tt-label">Combo</span>
        <span class="tt-combo" data-combo>x1</span>
      </div>
      <div class="tt-card">
        <span class="tt-label">Trick</span>
        <div class="tt-event-title" data-event-title>Stay smooth</div>
        <div class="tt-event-score" data-event-score>+0</div>
      </div>
    </div>

    <div class="tt-center">
      <div class="tt-timer" data-timer>01:15</div>
      <div class="tt-sub">Time Remaining</div>
    </div>

    <div class="tt-corner tt-right">
      <div>
        <span class="tt-label">Distance</span>
        <span class="tt-value" data-distance>0m</span>
      </div>
      <div class="tt-card">
        <span class="tt-label">Objectives</span>
        <div class="tt-objective" data-obj-finish><span>☆</span><span>Reach the finish</span></div>
        <div class="tt-objective" data-obj-avoid><span>☆</span><span>Avoid 6 obstacles</span></div>
        <div class="tt-objective" data-obj-jumps><span>☆</span><span>Perform 3 jumps</span></div>
      </div>
    </div>

    <div class="tt-progress">
      <div class="tt-progress-track">
        <div class="tt-progress-marker tt-progress-finish" style="top:0%"></div>
        <div class="tt-progress-marker" style="top:33%;opacity:.65"></div>
        <div class="tt-progress-marker" style="top:66%;opacity:.45"></div>
        <div class="tt-progress-marker tt-progress-player" data-progress-player style="top:100%"></div>
      </div>
    </div>

    <div class="tt-boost-wrap">
      <div class="tt-label">Boost</div>
      <div class="tt-bar"><div class="tt-bar-fill" data-boost></div></div>
    </div>

    <div class="tt-speed">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <path d="M40 170 A80 80 0 0 1 180 170" stroke="rgba(255,255,255,.14)" stroke-width="18" fill="none" stroke-linecap="round"></path>
        <path d="M48 170 A72 72 0 0 1 172 170" stroke="#36d8ff" stroke-width="18" fill="none" stroke-linecap="round" data-speed-arc></path>
      </svg>
      <div class="tt-speed-text">
        <strong data-speed>0</strong>
        <span>KM/H</span>
      </div>
    </div>
  </div>
`;

touchRoot.innerHTML = `
  <div class="tt-touch">
    <button data-touch="left">Lane -</button>
    <button data-touch="right">Lane +</button>
    <button data-touch="jump">Jump</button>
    <button data-touch="boost">Boost</button>
  </div>
`;

const overlay = document.createElement('div');
overlay.className = 'tt-overlay';
overlay.innerHTML = `
  <div class="tt-overlay-card">
    <h1>TRON TUNEL</h1>
    <p>
      Neonowy time attack w owalnym tunelu. Skręt zmienia pas jazdy, kamera i tunel rotują z opóźnieniem,
      boost wydłuża lot, a spacja ratuje skoki nad urwiskami bez rampy.
    </p>
    <div class="tt-grid">
      <div><strong>A / D lub strzałki</strong><span>Zmiana pasa jazdy</span></div>
      <div><strong>Shift</strong><span>Boost i dłuższe tricki</span></div>
      <div><strong>Spacja</strong><span>Jump nad gapem bez skoczni</span></div>
    </div>
    <button class="tt-button" data-start>Start Run</button>
  </div>
`;
document.body.appendChild(overlay);

const ui = {
  score: hudRoot.querySelector('[data-score]'),
  combo: hudRoot.querySelector('[data-combo]'),
  eventTitle: hudRoot.querySelector('[data-event-title]'),
  eventScore: hudRoot.querySelector('[data-event-score]'),
  timer: hudRoot.querySelector('[data-timer]'),
  distance: hudRoot.querySelector('[data-distance]'),
  boost: hudRoot.querySelector('[data-boost]'),
  speed: hudRoot.querySelector('[data-speed]'),
  speedArc: hudRoot.querySelector('[data-speed-arc]'),
  objFinish: hudRoot.querySelector('[data-obj-finish]'),
  objAvoid: hudRoot.querySelector('[data-obj-avoid]'),
  objJumps: hudRoot.querySelector('[data-obj-jumps]'),
  progressPlayer: hudRoot.querySelector('[data-progress-player]'),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020611);
scene.fog = new THREE.FogExp2(0x050914, 0.017);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 0, 14);

scene.add(new THREE.AmbientLight(0x73a9ff, 0.58));

const keyLight = new THREE.DirectionalLight(0x7bd5ff, 0.9);
keyLight.position.set(10, 18, 12);
scene.add(keyLight);

const magentaLight = new THREE.PointLight(0xff4ba7, 8, 140, 2);
const cyanLight = new THREE.PointLight(0x34d4ff, 10, 180, 2);
scene.add(magentaLight, cyanLight);

const farGlow = new THREE.Mesh(
  new THREE.SphereGeometry(4, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xa7e8ff, transparent: true, opacity: 0.92 }),
);
farGlow.position.set(0, 0, -220);
scene.add(farGlow);

const tunnelGroup = new THREE.Group();
const hazardGroup = new THREE.Group();
const decoGroup = new THREE.Group();
scene.add(tunnelGroup, hazardGroup, decoGroup);

const TUNNEL_RADIUS_X = 30;
const TUNNEL_RADIUS_Y = 18;
const LANE_ANGLES = [-1.05, -0.52, 0, 0.52, 1.05];
const TRACK_FORWARD = new THREE.Vector3(0, 0, -1);
const SEGMENT_LENGTH = 22;
const SEGMENT_COUNT = 28;
const FINISH_DISTANCE = 4200;

const state = {
  playing: false,
  finished: false,
  laneIndex: 2,
  laneAngle: 0,
  targetLaneAngle: 0,
  cameraAngle: 0,
  boost: 1,
  boostActive: false,
  speed: 72,
  score: 0,
  combo: 1,
  distance: 0,
  timeLeft: 75,
  avoided: 0,
  jumps: 0,
  airOffset: 0,
  airVelocity: 0,
  airborne: false,
  airDistance: 0,
  airLaneChanges: 0,
  boostJump: false,
  trickTimer: 0,
  flash: 0,
  tunnelPulse: 0,
};

const controls = {
  boost: false,
  laneCooldown: 0,
  jumpQueued: false,
};

const tunnelSegments = [];
const hazards = [];
let spawnCursor = -120;
let lastFrame = performance.now();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current, target, alpha) {
  return current + (target - current) * alpha;
}

function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function showEvent(title, score, color = '#ffd84d') {
  ui.eventTitle.textContent = title;
  ui.eventScore.textContent = score;
  ui.eventScore.style.color = color;
  state.trickTimer = 1.8;
}

function addScore(points, label, color) {
  const amount = Math.round(points * state.combo);
  state.score += amount;
  showEvent(label, `+${amount.toLocaleString('en-US')}`, color);
}

function markObjective(element, done) {
  element.classList.toggle('done', done);
  element.querySelector('span').textContent = done ? '★' : '☆';
}

function getTunnelFrame(angle, z, lift = 0) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const ellipsePoint = new THREE.Vector3(TUNNEL_RADIUS_X * sin, -TUNNEL_RADIUS_Y * cos, z);
  const outward = new THREE.Vector3(
    ellipsePoint.x / (TUNNEL_RADIUS_X * TUNNEL_RADIUS_X),
    ellipsePoint.y / (TUNNEL_RADIUS_Y * TUNNEL_RADIUS_Y),
    0,
  ).normalize();
  const inward = outward.clone().multiplyScalar(-1);
  const right = new THREE.Vector3().crossVectors(TRACK_FORWARD, inward).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, inward, TRACK_FORWARD);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const position = ellipsePoint.addScaledVector(inward, lift);
  return { position, inward, quaternion };
}

function createTunnelSegment(index) {
  const segment = new THREE.Group();
  segment.position.z = -index * SEGMENT_LENGTH;
  tunnelGroup.add(segment);

  const panelGeometry = new THREE.BoxGeometry(8.6, 1.4, SEGMENT_LENGTH * 0.94);
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x15233d,
    emissive: 0x0c1430,
    emissiveIntensity: 0.25,
    metalness: 0.8,
    roughness: 0.34,
  });

  for (let i = 0; i < 20; i++) {
    const sliceAngle = (i / 20) * Math.PI * 2;
    const point = new THREE.Vector3(
      TUNNEL_RADIUS_X * Math.cos(sliceAngle),
      TUNNEL_RADIUS_Y * Math.sin(sliceAngle),
      0,
    );
    const tangent = new THREE.Vector3(
      -TUNNEL_RADIUS_X * Math.sin(sliceAngle),
      TUNNEL_RADIUS_Y * Math.cos(sliceAngle),
      0,
    ).normalize();
    const outward = new THREE.Vector3(
      point.x / (TUNNEL_RADIUS_X * TUNNEL_RADIUS_X),
      point.y / (TUNNEL_RADIUS_Y * TUNNEL_RADIUS_Y),
      0,
    ).normalize();
    const basis = new THREE.Matrix4().makeBasis(tangent, outward, new THREE.Vector3(0, 0, 1));
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.copy(point).addScaledVector(outward, 0.8);
    panel.quaternion.setFromRotationMatrix(basis);
    segment.add(panel);

    if (i % 2 === 0) {
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(4.8, 0.22, 3.8),
        new THREE.MeshStandardMaterial({
          color: i % 4 === 0 ? 0x3de3ff : 0xff7e54,
          emissive: i % 4 === 0 ? 0x3de3ff : 0xff7e54,
          emissiveIntensity: 3.8,
          metalness: 0.45,
          roughness: 0.25,
        }),
      );
      neon.position.copy(point).addScaledVector(outward, -0.4);
      neon.quaternion.setFromRotationMatrix(basis);
      segment.add(neon);
    }
  }

  const arrows = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.18, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x34c8ff, transparent: true, opacity: 0.78 }),
  );
  arrows.position.set(0, -TUNNEL_RADIUS_Y + 2.5, 0);
  segment.add(arrows);

  tunnelSegments.push(segment);
}

function createCar() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.7, 7.2),
    new THREE.MeshPhysicalMaterial({
      color: 0x18b751,
      metalness: 0.75,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      emissive: 0x032a12,
      emissiveIntensity: 1.1,
    }),
  );
  body.position.y = 0.4;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 1.1, 3.4),
    new THREE.MeshPhysicalMaterial({
      color: 0x89d8ff,
      metalness: 0,
      transmission: 0.55,
      transparent: true,
      opacity: 0.62,
      roughness: 0.04,
    }),
  );
  cabin.position.set(0, 1.25, 0.2);
  group.add(cabin);

  const boosterMaterial = new THREE.MeshBasicMaterial({ color: 0x59ecff, transparent: true, opacity: 0.95 });
  const boosterGlow = [];
  for (const x of [-1.1, 1.1]) {
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.46, 2.8, 10, 1, true), boosterMaterial);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(x, 0.05, 4.3);
    group.add(flame);
    boosterGlow.push(flame);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.72, 0.72, 0.44, 18);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090b10, metalness: 0.35, roughness: 0.75 });
  const wheels = [];
  for (const x of [-1.75, 1.75]) {
    for (const z of [-2.35, 2.35]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.45, z);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  scene.add(group);
  return { group, wheels, boosterGlow };
}

const car = createCar();

function createSpeedLines() {
  for (let i = 0; i < 14; i++) {
    const material = new THREE.LineBasicMaterial({ color: 0x3bceff, transparent: true, opacity: 0.35 });
    const points = [
      new THREE.Vector3(randomRange(-12, 12), randomRange(-6, 6), -randomRange(20, 220)),
      new THREE.Vector3(randomRange(-12, 12), randomRange(-6, 6), -randomRange(32, 232)),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    decoGroup.add(line);
  }
}

function spawnHazard(z, forcedType = null, forcedLane = null) {
  const laneIndex = forcedLane ?? Math.floor(Math.random() * LANE_ANGLES.length);
  const angle = LANE_ANGLES[laneIndex];
  const roll = Math.random();
  const type = forcedType ?? (roll < 0.45 ? 'obstacle' : roll < 0.72 ? 'ramp' : 'gap');
  const root = new THREE.Group();
  hazardGroup.add(root);

  if (type === 'obstacle') {
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 2.6, 5.4),
      new THREE.MeshStandardMaterial({
        color: 0x1c2034,
        emissive: 0xff7f3d,
        emissiveIntensity: 0.8,
        metalness: 0.75,
        roughness: 0.28,
      }),
    ));
  } else if (type === 'ramp') {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.7, 8.6),
      new THREE.MeshStandardMaterial({
        color: 0x483412,
        emissive: 0xffd348,
        emissiveIntensity: 0.48,
        metalness: 0.4,
        roughness: 0.58,
      }),
    );
    base.rotation.x = -0.34;
    root.add(base);
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.1, 3.6),
      new THREE.MeshBasicMaterial({ color: 0xff7cf4, transparent: true, opacity: 0.72 }),
    );
    marker.position.y = 0.6;
    root.add(marker);
  } else {
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x2d304a, emissive: 0x34daff, emissiveIntensity: 1.6 });
    const leftEdge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 9.4), edgeMaterial);
    leftEdge.position.x = -3.25;
    const rightEdge = leftEdge.clone();
    rightEdge.position.x = 3.25;
    const abyss = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.08, 8.5),
      new THREE.MeshBasicMaterial({ color: 0x04070f, transparent: true, opacity: 0.92 }),
    );
    abyss.position.y = -0.75;
    root.add(leftEdge, rightEdge, abyss);
  }

  hazards.push({
    type,
    laneIndex,
    angle,
    z,
    root,
    resolved: false,
    counted: false,
    failed: false,
  });

  if (type === 'ramp' && Math.random() > 0.45) {
    spawnHazard(z - randomRange(16, 24), 'gap', laneIndex);
  }
}

function populateTrack() {
  for (let i = 0; i < SEGMENT_COUNT; i++) createTunnelSegment(i);
  createSpeedLines();
  while (spawnCursor > -760) {
    spawnHazard(spawnCursor);
    spawnCursor -= randomRange(24, 38);
  }
}

populateTrack();

function recycleHazards() {
  for (let index = hazards.length - 1; index >= 0; index -= 1) {
    if (hazards[index].z > 28) {
      hazardGroup.remove(hazards[index].root);
      hazards.splice(index, 1);
    }
  }

  while (spawnCursor - state.distance > -760) {
    spawnHazard(spawnCursor - state.distance);
    spawnCursor -= randomRange(24, 38);
  }
}

function queueJump() {
  controls.jumpQueued = true;
}

function shiftLane(step) {
  if (!state.playing || state.finished || controls.laneCooldown > 0) return;
  const nextLane = clamp(state.laneIndex + step, 0, LANE_ANGLES.length - 1);
  if (nextLane === state.laneIndex) return;
  state.laneIndex = nextLane;
  controls.laneCooldown = 0.11;
  if (state.airborne) state.airLaneChanges += 1;
}

window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD'].includes(event.code)) {
    event.preventDefault();
  }
  if (event.repeat) return;
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') shiftLane(-1);
  if (event.code === 'ArrowRight' || event.code === 'KeyD') shiftLane(1);
  if (event.code === 'Space') queueJump();
});

window.addEventListener('keydown', event => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') controls.boost = true;
});

window.addEventListener('keyup', event => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') controls.boost = false;
});

for (const button of touchRoot.querySelectorAll('[data-touch]')) {
  const action = button.getAttribute('data-touch');
  const start = event => {
    event.preventDefault();
    if (action === 'left') shiftLane(-1);
    if (action === 'right') shiftLane(1);
    if (action === 'jump') queueJump();
    if (action === 'boost') controls.boost = true;
  };
  const end = event => {
    event.preventDefault();
    if (action === 'boost') controls.boost = false;
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('pointerleave', end);
}

function launch(power, boostJump) {
  if (state.airborne) return;
  state.airborne = true;
  state.airVelocity = power;
  state.airOffset = 0.08;
  state.airDistance = 0;
  state.airLaneChanges = 0;
  state.boostJump = boostJump;
  state.jumps += 1;
  state.tunnelPulse = 1;
}

function handleLanding() {
  const meters = Math.round(state.airDistance);
  const parts = [];
  let points = 0;

  if (meters >= 18) {
    parts.push(`Jump ${meters}m`);
    points += meters * 18;
  }
  if (state.airLaneChanges > 0) {
    parts.push(`Air Switch x${state.airLaneChanges}`);
    points += state.airLaneChanges * 180;
  }
  if (state.boostJump) {
    parts.push('Boost Trick');
    points += 420;
  }

  if (points > 0) {
    state.combo = Math.min(8, state.combo + 1);
    addScore(points, parts.join(' + '), '#ffd84d');
  } else {
    showEvent('Touchdown', '+0', '#36d8ff');
  }

  state.airOffset = 0;
  state.airVelocity = 0;
  state.airborne = false;
  state.boostJump = false;
}

function onCrash(reason) {
  state.timeLeft = Math.max(0, state.timeLeft - 7);
  state.combo = 1;
  state.flash = 1;
  state.boost = Math.max(0.15, state.boost * 0.42);
  state.airborne = false;
  state.airOffset = 0;
  state.airVelocity = 0;
  showEvent(reason, '-7s', '#ff6f78');
}

function updatePlayer(dt) {
  state.targetLaneAngle = LANE_ANGLES[state.laneIndex];
  state.laneAngle = damp(state.laneAngle, state.targetLaneAngle, 9, dt);
  state.cameraAngle = damp(state.cameraAngle, state.targetLaneAngle, 4.2, dt);
  controls.laneCooldown = Math.max(0, controls.laneCooldown - dt);

  state.boostActive = controls.boost && state.boost > 0.02;
  const targetSpeed = state.boostActive ? 104 : 74;
  state.speed = damp(state.speed, targetSpeed, state.boostActive ? 4.2 : 2.1, dt);

  if (state.boostActive) {
    state.boost = Math.max(0, state.boost - dt * 0.3);
  } else {
    state.boost = Math.min(1, state.boost + dt * 0.18);
  }

  if (controls.jumpQueued && !state.airborne) {
    launch(18 + state.speed * 0.05, state.boostActive);
  }
  controls.jumpQueued = false;

  if (state.airborne) {
    state.airDistance += state.speed * dt;
    state.airVelocity -= 32 * dt;
    state.airOffset += state.airVelocity * dt;
    if (state.airOffset <= 0) handleLanding();
  }

  const frame = getTunnelFrame(state.laneAngle, 2.6, 1.32 + state.airOffset);
  car.group.position.copy(frame.position);
  car.group.quaternion.copy(frame.quaternion);

  const wheelSpin = dt * state.speed * 0.4;
  for (const wheel of car.wheels) wheel.rotation.x -= wheelSpin;

  const flameScale = state.boostActive ? 1.35 + Math.sin(performance.now() * 0.015) * 0.14 : 0.55;
  for (const flame of car.boosterGlow) {
    flame.scale.set(1, flameScale, 1);
    flame.material.opacity = state.boostActive ? 0.98 : 0.34;
  }

  const cameraFrame = getTunnelFrame(state.cameraAngle, 0, 1.3 + state.airOffset * 0.35);
  const cameraPos = cameraFrame.position.clone()
    .addScaledVector(cameraFrame.inward, 8.5)
    .add(new THREE.Vector3(0, 0, 13.5));
  const lookAt = frame.position.clone()
    .addScaledVector(cameraFrame.inward, 1.4)
    .add(new THREE.Vector3(0, 0, -18));

  camera.position.lerp(cameraPos, 1 - Math.exp(-7 * dt));
  camera.up.lerp(cameraFrame.inward, 1 - Math.exp(-8 * dt)).normalize();
  camera.lookAt(lookAt);

  magentaLight.position.copy(frame.position).addScaledVector(frame.inward, 8).add(new THREE.Vector3(0, 0, -30));
  cyanLight.position.copy(frame.position).addScaledVector(frame.inward, 5).add(new THREE.Vector3(0, 0, 10));
}

function updateTunnel(dt) {
  const deltaZ = state.speed * dt;
  const loopLength = SEGMENT_COUNT * SEGMENT_LENGTH;

  for (const segment of tunnelSegments) {
    segment.position.z += deltaZ;
    if (segment.position.z > SEGMENT_LENGTH * 1.2) segment.position.z -= loopLength;
    segment.rotation.z = Math.sin((segment.position.z - state.distance * 0.16) * 0.05) * 0.06;
  }

  for (let i = 0; i < decoGroup.children.length; i += 1) {
    const line = decoGroup.children[i];
    line.position.z += deltaZ * (1.2 + i * 0.02);
    if (line.position.z > 40) line.position.z = -240 - i * 8;
  }

  farGlow.scale.setScalar(1 + state.tunnelPulse * 0.22);
  state.tunnelPulse = Math.max(0, state.tunnelPulse - dt * 2.6);
}

function updateHazards(dt) {
  for (const hazard of hazards) {
    hazard.z += state.speed * dt;
    const frame = getTunnelFrame(hazard.angle, hazard.z, hazard.type === 'obstacle' ? 1.8 : 0.45);
    hazard.root.position.copy(frame.position);
    hazard.root.quaternion.copy(frame.quaternion);

    const sameLane = hazard.laneIndex === state.laneIndex;
    if (!hazard.resolved && hazard.z > -2.2 && hazard.z < 1.8 && sameLane) {
      if (hazard.type === 'obstacle') {
        if (state.airOffset < 1.9) {
          hazard.failed = true;
          onCrash('Barrier Hit');
        } else {
          state.combo = Math.min(8, state.combo + 1);
          addScore(260, 'Air Dodge', '#36d8ff');
        }
        hazard.resolved = true;
      }

      if (hazard.type === 'gap') {
        if (state.airOffset < 1.35) {
          hazard.failed = true;
          onCrash('Missed The Gap');
        } else {
          state.combo = Math.min(8, state.combo + 1);
          addScore(340, 'Gap Clear', '#36d8ff');
        }
        hazard.resolved = true;
      }

      if (hazard.type === 'ramp' && !state.airborne) {
        launch(22 + state.speed * 0.09 + (state.boostActive ? 6 : 0), state.boostActive);
        hazard.resolved = true;
      }
    }

    if (!hazard.counted && hazard.z > 7) {
      hazard.counted = true;
      if (!hazard.failed && (hazard.type === 'obstacle' || hazard.type === 'gap')) {
        state.avoided += 1;
      }
    }
  }

  recycleHazards();
}

function updateUi(dt) {
  ui.score.textContent = Math.round(state.score).toLocaleString('en-US');
  ui.combo.textContent = `x${state.combo}`;
  ui.timer.textContent = formatTime(state.timeLeft);
  ui.distance.textContent = `${Math.min(FINISH_DISTANCE, Math.round(state.distance))}m`;
  ui.boost.style.transform = `scaleX(${state.boost.toFixed(3)})`;

  const kmh = Math.round(state.speed * 3.6);
  ui.speed.textContent = String(kmh);
  ui.speedArc.setAttribute('stroke', state.boostActive ? '#ff5aab' : '#36d8ff');

  const percent = clamp((kmh - 180) / 220, 0.1, 1);
  const radius = 72;
  const endAngle = Math.PI * percent;
  const endX = 110 + Math.cos(Math.PI - endAngle) * radius;
  const endY = 170 - Math.sin(Math.PI - endAngle) * radius;
  ui.speedArc.setAttribute('d', `M 48 170 A ${radius} ${radius} 0 ${percent > 0.5 ? 1 : 0} 1 ${endX} ${endY}`);

  ui.progressPlayer.style.top = `${100 - clamp(state.distance / FINISH_DISTANCE, 0, 1) * 100}%`;

  markObjective(ui.objFinish, state.distance >= FINISH_DISTANCE);
  markObjective(ui.objAvoid, state.avoided >= 6);
  markObjective(ui.objJumps, state.jumps >= 3);

  if (state.trickTimer > 0) {
    state.trickTimer = Math.max(0, state.trickTimer - dt);
  } else {
    ui.eventTitle.textContent = state.airborne ? 'Hang Time' : 'Stay Smooth';
    ui.eventScore.textContent = state.airborne ? `+${Math.round(state.airDistance)}m` : '+0';
    ui.eventScore.style.color = state.airborne ? '#36d8ff' : '#ffd84d';
  }

  renderer.domElement.style.filter = state.flash > 0
    ? `saturate(${1 + state.flash * 0.5}) brightness(${1 + state.flash * 0.3})`
    : 'none';
}

function finishRun(victory) {
  if (state.finished) return;
  state.finished = true;
  state.playing = false;

  const title = victory ? 'Finish Locked' : 'Signal Lost';
  const subtitle = victory
    ? 'Tunel przejechany przed końcem czasu.'
    : 'Czas skończył się zanim dobiegł koniec trasy.';

  overlay.innerHTML = `
    <div class="tt-overlay-card">
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <div class="tt-grid">
        <div><strong>Score</strong><span>${Math.round(state.score).toLocaleString('en-US')}</span></div>
        <div><strong>Avoided</strong><span>${state.avoided} obstacles</span></div>
        <div><strong>Jumps</strong><span>${state.jumps} total</span></div>
      </div>
      <button class="tt-button" data-restart>Restart Run</button>
    </div>
  `;
  overlay.style.display = 'grid';
  overlay.querySelector('[data-restart]').addEventListener('click', () => window.location.reload());
}

function update(dt) {
  if (!state.playing || state.finished) return;

  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.distance += state.speed * dt;
  state.score += state.speed * dt * 1.8;
  state.flash = Math.max(0, state.flash - dt * 2.4);

  updatePlayer(dt);
  updateTunnel(dt);
  updateHazards(dt);
  updateUi(dt);

  if (state.distance >= FINISH_DISTANCE) finishRun(true);
  if (state.timeLeft <= 0) finishRun(false);
}

function render(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

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
  lastFrame = performance.now();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateUi(0);
requestAnimationFrame(render);