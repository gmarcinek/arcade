import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createPhysicsWorld } from './physics/PhysicsWorld.js';
import { Terrain } from './world/Terrain.js';
import { CityBuilder } from './world/CityBuilder.js';
import { PlayerCar } from './car/PlayerCar.js';
import { Car } from './car/Car.js';
import { NPCCar } from './entities/NPCCar.js';
import { PoliceCar } from './entities/PoliceCar.js';
import { Zombie } from './entities/Zombie.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { TouchInput } from './input/TouchInput.js';
import { CameraController, CamState } from './camera/CameraController.js';
import { GameTimer } from './systems/GameTimer.js';
import { CollisionHandler } from './systems/CollisionHandler.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { DamageOverlay } from './ui/DamageOverlay.js';
import { ParticleSystem } from './effects/ParticleSystem.js';
import { DebrisSystem } from './effects/DebrisSystem.js';
import { MAP as defaultMap } from './world/mapData.js';
import { MapEditor } from './world/MapEditor.js';
import { WORLD_SIZE } from './constants.js';
import suvModelUrl from './assets/suv.glb?url';
import {
  CAMERA_OFFSET_BEHIND,
  CREDITS_CAR_KILL,
  CREDITS_HEAL_COST,
  CREDITS_ZOMBIE,
  HEAL_AMOUNT,
  HP_TO_CREDIT,
  HP_TO_TIME,
  GRAVITY,
} from './physicsConfig.js';
import { AudioManager }      from './audio/AudioManager.js';
import { setObstacles }      from './ai/sensors.js';
import { DriveRecorder }     from './ai/DriveRecorder.js';
import { PolicyNet, TRAINED_MODEL } from './ai/PolicyNet.js';

// ── Map ────────────────────────────────────────────────────
let MAP = defaultMap;

let _gameLoopStarted   = false;

// ── Wczytaj model auta (async, przed inicjalizacją) ───────────────
try {
  Car.suvGltf = await new GLTFLoader().loadAsync(suvModelUrl);
} catch (e) {
  console.warn('GLB load failed, using fallback car model:', e);
}

// ── Renderer ──────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

// ── Scene ─────────────────────────────────────────────────────────
function createSkyTexture() {
  const sky = document.createElement('canvas');
  sky.width = 16;
  sky.height = 256;
  const context = sky.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, sky.height);
  gradient.addColorStop(0, '#16294f');
  gradient.addColorStop(0.42, '#5d87ae');
  gradient.addColorStop(0.68, '#e4a36f');
  gradient.addColorStop(1, '#f4c99a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, sky.width, sky.height);

  const texture = new THREE.CanvasTexture(sky);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const scene = new THREE.Scene();
scene.background = createSkyTexture();
scene.fog = new THREE.Fog(0xe2a071, 180, WORLD_SIZE * 0.82);

// ── Lighting ──────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0x9fc9ff, 0x243421, 1.15));

// Słońce główne (ciepłe, cienie)
const sun = new THREE.DirectionalLight(0xffc078, 2.1);
sun.position.set(50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = WORLD_SIZE;
sun.shadow.camera.left = sun.shadow.camera.bottom = -WORLD_SIZE * 0.5;
sun.shadow.camera.right = sun.shadow.camera.top = WORLD_SIZE * 0.5;
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2;
scene.add(sun);

// Fill light (miękki, z lewej) — wypełnia cień po prawej stronie auta
const fill = new THREE.DirectionalLight(0x7ca4ff, 0.45);
fill.position.set(-60, 30, 0);
scene.add(fill);

// Rim light (zimny niebieski, z tyłu) — podkreśla krawędzie clearcoat
const rim = new THREE.DirectionalLight(0x88bbff, 0.25);
rim.position.set(0, 10, -80);
scene.add(rim);

renderer.toneMappingExposure = 1.12;

// ── Camera ────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const hueShiftPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    vec3 rgbToHsv(vec3 color) {
      vec4 k = vec4(0.0, -0.3333333, 0.6666667, -1.0);
      vec4 p = mix(vec4(color.bg, k.wz), vec4(color.gb, k.xy), step(color.b, color.g));
      vec4 q = mix(vec4(p.xyw, color.r), vec4(color.r, p.yzx), step(p.x, color.r));
      float d = q.x - min(q.w, q.y);
      float e = 0.0000001;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
    vec3 hsvToRgb(vec3 color) {
      vec3 p = abs(fract(color.xxx + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
      return color.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), color.y);
    }
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 hsv = rgbToHsv(source.rgb);
      hsv.x = fract(hsv.x + time * 0.16);
      hsv.y = min(1.0, hsv.y + 0.2);
      gl_FragColor = vec4(hsvToRgb(hsv), source.a);
    }
  `,
});
hueShiftPass.enabled = false;
composer.addPass(hueShiftPass);

// ── Physics ───────────────────────────────────────────────────────
const world = createPhysicsWorld();

// ── World building ────────────────────────────────────────────────
const terrain = new Terrain();
terrain.build(scene, world);

// ── Game objects — lazy-init in initWorld() after map selection ───
let city, player, npcCars = [], zombies = [], collisions, policeCar = null;
let _worldModifier = null;

function _raisePoliceAlarm(position) {
  if (policeCar?.raiseAlarm(position)) {
    hud.showMessage('POLICJA: ALARM!', '#4ca8ff', 1500);
  }
}

function _clearWorldModifier() {
  if (!_worldModifier) return;
  _worldModifier.restore();
  _worldModifier = null;
  hud.setWorldModifier();
}

function _activateWorldModifier() {
  _clearWorldModifier();
  const effects = [
    {
      label: 'MOON GRAVITY',
      icon: '☾',
      weight: 1,
      apply: () => world.gravity.set(0, -1.955, 0),
      restore: () => world.gravity.set(0, GRAVITY, 0),
    },
    {
      label: 'JUPITER GRAVITY',
      icon: '♃',
      weight: 0.5,
      apply: () => world.gravity.set(0, -28.6, 0),
      restore: () => world.gravity.set(0, GRAVITY, 0),
    },
    {
      label: 'MONSTER WHEELS',
      icon: '⚙',
      weight: 1,
      apply: () => [player, ...npcCars, policeCar].forEach(car => car?.setChaosWheels(true)),
      restore: () => [player, ...npcCars, policeCar].forEach(car => car?.setChaosWheels(false)),
    },
    {
      label: 'TURBO OPPONENTS',
      icon: '⇈',
      weight: 1,
      apply: () => { NPCCar.speedMultiplier = 2; },
      restore: () => { NPCCar.speedMultiplier = 1; },
    },
    {
      label: 'FAST PEDESTRIANS',
      icon: '⚡',
      weight: 1,
      apply: () => { Zombie.speedMultiplier = 4; },
      restore: () => { Zombie.speedMultiplier = 1; },
    },
    {
      label: 'SUPERMAN MODE',
      icon: 'S',
      weight: 0.7,
      apply: () => { player.supermanMode = true; },
      restore: () => { player.supermanMode = false; },
    },
    {
      label: 'INSTANT BRAKE',
      icon: '▣',
      weight: 0.8,
      apply: () => { player.instantBrakeMode = true; },
      restore: () => { player.instantBrakeMode = false; },
    },
    {
      label: 'LSD',
      icon: '◉',
      weight: 0.6,
      apply: () => { hueShiftPass.enabled = true; },
      restore: () => { hueShiftPass.enabled = false; },
    },
  ];
  const totalWeight = effects.reduce((sum, effect) => sum + effect.weight, 0);
  let selection = Math.random() * totalWeight;
  const effect = effects.find(candidate => (selection -= candidate.weight) <= 0) ?? effects[0];
  effect.apply();
  _worldModifier = { ...effect, remaining: 15 };
  hud.showMessage(`${effect.icon} ${effect.label}`, '#ff9b38', 1800);
}

function _tickWorldModifier(dt) {
  if (!_worldModifier) return;
  _worldModifier.remaining -= dt;
  if (_worldModifier.remaining <= 0) {
    _clearWorldModifier();
    return;
  }
  hud.setWorldModifier(_worldModifier.icon, _worldModifier.label, _worldModifier.remaining);
}

// ── AI oponentów ── produkcja korzysta z nowej AI stanowej; uczenie jest tylko lokalne.
const AI_MODE_KEY = 'zombieRacerAiMode';
// Endpoint zapisu istnieje tylko w lokalnym serwerze dev (vite.config.js)
const IS_LOCAL_AI_ENV = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const CAN_RECORD = IS_LOCAL_AI_ENV;
let _recordDrive = false;
/** @type {DriveRecorder|null} */
let recorder = null;

// ── Input ─────────────────────────────────────────────────────────
// pointer: coarse = palec/rysik (prawdziwy dotyk); fine = myszka/touchpad
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const input = isTouchDevice ? new TouchInput() : new KeyboardInput();

if (!isTouchDevice) {
  let isDraggingCamera = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  canvas.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    isDraggingCamera = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  });
  window.addEventListener('mousemove', event => {
    if (!isDraggingCamera) return;
    camCtrl.dragLook(event.clientX - lastPointerX, event.clientY - lastPointerY);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  });
  window.addEventListener('mouseup', () => {
    if (!isDraggingCamera) return;
    isDraggingCamera = false;
    camCtrl.releaseDragLook();
  });

  window.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.key !== '1') return;
    event.preventDefault();
    const visible = Car.toggleCollisionDebug();
    hud.showMessage(visible ? 'BRYLA KOLIZYJNA: ON' : 'BRYLA KOLIZYJNA: OFF', visible ? '#ff38e1' : '#aaaaaa', 1200);
  });
}

// ── Systems ───────────────────────────────────────────────────────
const particles = new ParticleSystem(scene);
const audio = new AudioManager();
const debris    = new DebrisSystem(scene, world, audio);
const camCtrl = new CameraController(camera);
const timer = new GameTimer();
const hud     = new HUD();
const minimap = isTouchDevice ? null : new Minimap();
const damageOverlay = new DamageOverlay();

// AudioContext wymaga gestu użytkownika — startujemy przy pierwszym naciśnięciu klawisza / dotyku
const KBD = 'display:inline-block;background:#222;border:1px solid #555;border-radius:4px;padding:2px 9px;font-size:14px;color:#fff;font-family:monospace;';
const _controlsOverlay = document.createElement('div');
_controlsOverlay.id = 'controls-overlay';
_controlsOverlay.innerHTML = `
  <div style="
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.72);z-index:9999;font-family:system-ui,sans-serif;
  ">
    <div style="
      background:rgba(10,10,10,0.9);border:2px solid rgba(255,255,255,0.18);
      border-radius:12px;padding:36px 52px;text-align:center;min-width:320px;
    ">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:3px;margin-bottom:24px;">ZOMBIE RACER</div>
      ${isTouchDevice ? `
      <table style="margin:0 auto;border-collapse:collapse;font-size:17px;color:#ddd;">
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Prawe koło</kbd></td><td style="color:#aaa;">Gaz, cofanie i skręt</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Lewa</kbd></td><td style="color:#aaa;">BRAKE</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">LECZ</kbd></td><td style="color:#aaa;">Naprawa <span style="color:#666;font-size:13px;">(-50 CR)</span></td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">NA KOŁA</kbd></td><td style="color:#aaa;">Stawianie auta</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">START</kbd></td><td style="color:#aaa;">Powrót na start</td></tr>
      </table>
      <div style="margin-top:28px;font-size:14px;color:#777;letter-spacing:1px;">DOTKNIJ EKRANU: FULLSCREEN, POTEM GRAJ W POZIOMIE</div>
      ` : `
      <table style="margin:0 auto;border-collapse:collapse;font-size:17px;color:#ddd;">
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">↑ ↓ ← →</kbd></td><td style="color:#aaa;">Jedź</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Shift</kbd></td><td style="color:#aaa;">TURBO</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Backspace</kbd></td><td style="color:#aaa;">Reperowanie <span style="color:#666;font-size:13px;">(-50 CR)</span></td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Insert</kbd></td><td style="color:#aaa;">Respawn tu i teraz</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Home</kbd></td><td style="color:#aaa;">Powrót na start</td></tr>
      </table>
      <div style="margin-top:28px;font-size:14px;color:#555;letter-spacing:1px;">NACIŚNIJ DOWOLNY KLAWISZ LUB KLIKNIJ</div>
      `}
    </div>
  </div>
`;
document.body.appendChild(_controlsOverlay);
const _dismissOverlay = () => { _controlsOverlay.remove(); };

const _enterFullscreen = async () => {
  if (!isTouchDevice) return;
  const el = document.documentElement;
  const request = el.requestFullscreen?.bind(el)
    || el.webkitRequestFullscreen?.bind(el)
    || el.msRequestFullscreen?.bind(el);
  if (!document.fullscreenElement && !document.webkitFullscreenElement && request) {
    try { await request(); } catch {}
  }
  try { await screen.orientation?.lock?.('landscape'); } catch {}
};

const _startAudio = () => { audio.start(); window.removeEventListener('keydown', _startAudio); window.removeEventListener('touchstart', _startAudio); window.removeEventListener('click', _startAudio); };
const _startMobilePresentation = () => {
  _enterFullscreen();
  window.removeEventListener('touchstart', _startMobilePresentation);
  window.removeEventListener('click', _startMobilePresentation);
};
window.addEventListener('keydown',   _startAudio);
window.addEventListener('touchstart', _startAudio);
window.addEventListener('click',      _startAudio);
window.addEventListener('touchstart', _startMobilePresentation);
window.addEventListener('click',      _startMobilePresentation);
window.addEventListener('keydown',    _dismissOverlay, { once: true });
window.addEventListener('click',      _dismissOverlay, { once: true });
window.addEventListener('touchstart', _dismissOverlay, { once: true });

let zombieKills = 0;
let carKills = 0;
let credits = 0;
let _prevBoostActive = false;
let _smokeTimer = 0;
let _oilTimer   = 0;
const _smokeOffset = new THREE.Vector3();



const DESTROY_CAM_ORBIT_SHIFT = 5.5;

function _getDestroyCamOrbitOffset(velX = 0, velZ = 0) {
  const speed = Math.hypot(velX, velZ);
  if (speed < 0.001) return { x: 0, y: 0, z: 0 };
  return {
    x: (velX / speed) * DESTROY_CAM_ORBIT_SHIFT,
    y: 0,
    z: (velZ / speed) * DESTROY_CAM_ORBIT_SHIFT,
  };
}

function addCredits(amount, label, color) {
  credits += amount;
  hud.showMessage(`${amount >= 0 ? '+' : ''}${amount} CR  ${label}`, color, 1200);
}

function onZombieKill(zombie) {
  if (recorder && zombie.mesh) recorder.reward({ x: zombie.mesh.position.x, z: zombie.mesh.position.z }, 1.0);
  zombie.kill(scene, world);
  timer.addTime(20);
  zombieKills++;
  addCredits(CREDITS_ZOMBIE, '🧟 +20s', '#44ff44');
  const pos = zombie.mesh ? zombie.mesh.position : { x: 0, z: 0 };
  particles.spawnBloodSplatter(pos.x, 1, pos.z);
  audio.playZombieHit();
  checkWinConditions();
}

function showWin(reason, playFanfare = true) {
  if (gameOverVisible) return;
  gameOverVisible = true;
  if (playFanfare) audio.playWin();
  const landingHref = window.location.pathname.includes('/dist/') ? '../landingPage.html' : './landingPage.html';
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.88);
    display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;`;
  el.innerHTML = `
    <div style="font-size:68px;font-weight:900;color:#00ff88;letter-spacing:4px;text-shadow:0 0 30px #00ff88;">WYGRAŁEŚ!</div>
    <div style="font-size:22px;color:#ccc;margin:12px 0 8px;">${reason}</div>
    <div style="font-size:18px;color:#ffcc00;margin:0 0 32px;">🧟 ${zombieKills} zombie &nbsp;|&nbsp; 🚗 ${carKills} auta &nbsp;|&nbsp; 💰 ${credits} CR</div>
    <button onclick="location.reload()"
      style="padding:14px 44px;font-size:18px;font-weight:800;background:#00cc66;color:#fff;
             border:none;border-radius:10px;cursor:pointer;letter-spacing:2px;">ZAGRAJ PONOWNIE</button>
    <button onclick="location.href='${landingHref}'"
      style="margin-top:12px;padding:10px 32px;font-size:14px;background:transparent;
             color:#888;border:1px solid #444;border-radius:8px;cursor:pointer;">← Arcade</button>
  `;
  document.body.appendChild(el);
}

function checkWinConditions() {
  if (gameOverVisible || _winSequence) return;
  if (npcCars.length > 0) {
    const aliveNpcs = npcCars.filter(c => c.isAlive).length;
    if (aliveNpcs === 0) {
      _winSequence = true;
      audio.playWin();
      hud.showMessage('OSTATNI OPONENT ZNISZCZONY!', '#00ff88', 3500);
      setTimeout(() => showWin('Wszystkich oponentów zniszczono! 🚗💥', false), 4000);
      return;
    }
  }
  if (zombies.length > 0) {
    const aliveZombies = zombies.filter(z => z.isAlive).length;
    if (aliveZombies === 0) { showWin('Wszystkie zombie rozjechane! 🧟💀'); }
  }
}

function _explodeNPC(npc, velX = 0, velY = 0, velZ = 0) {
  // Pobierz pozycję PRZED destroy
  const ep = npc.chassisBody
    ? { x: npc.chassisBody.position.x, y: npc.chassisBody.position.y, z: npc.chassisBody.position.z }
    : (npc.group ? { x: npc.group.position.x, y: npc.group.position.y, z: npc.group.position.z } : null);
  if (!ep) return;

  // Ghost mode: kamera śledzi fizyczne ciało NPC przez ~3s po wybuchu
  // target: npc.group — _computeOrbit ślędzi jego pozycję jak żywy NPC
  camCtrl.setState(CamState.NPC_DESTROY, {
    target:      npc.group,
    anchor:      ep,
    orbitOffset: _getDestroyCamOrbitOffset(velX, velZ),
  });

  // Eksplozja particle (natychmiastowa)
  particles.spawnExplosion(ep.x, ep.y + 1, ep.z);
  audio.playCarExplosion();

  // Drugi jądro wybuchu 250ms później (większe, z gory)
  setTimeout(() => {
    particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.5, ep.y + 2.5, ep.z + (Math.random() - 0.5) * 1.5);
    particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.0, ep.y + 0.5, ep.z + (Math.random() - 0.5) * 1.0);
    audio.playCarExplosion();
  }, 250);

  // Gruz fizyczny — dziedziczy prędkość auta + wybuch
  debris.spawn(
    ep.x, ep.y + 0.5, ep.z,
    velX, velY, velZ,
    (x, y, z, type) => particles.spawnSmoke(x, y, z, type)
  );

  // Ghost: usuń tylko koła z fizyki — chassis body pozostaje w świecie (leci)
  if (npc.vehicle) {
    try { npc.vehicle.removeFromWorld(world); } catch (_) {}
    npc.vehicle = null;
  }
  // Wyrzuć chassis body w górę z zachowaniem pędu poziomego
  // Usuń body fizyczne natychmiast — debris jest osobnym systemem i zostaje
  if (npc.chassisBody) {
    try { world.removeBody(npc.chassisBody); } catch (_) {}
    npc.chassisBody = null;
  }
  // Ukryj mesh
  if (npc.group) npc.group.visible = false;
  for (const wm of npc.wheelMeshes) wm.visible = false;
  // Timer tylko do sprzątania meshy ze sceny (body już nie ma)
  npc._ghostTimer = 3.0;

  // ── Blast wave — obrażenia i siła od wybuchu ──────────────────────
  const BLAST_RADIUS     = 12;   // [m]
  const BLAST_DMG_NPC    = 400;  // HP obrażeń NPC przy epicentrum (skala z dystansem)
  const BLAST_DMG_PLAYER = 60;   // HP obrażeń gracza przy epicentrum
  const BLAST_FORCE      = 14000; // [N·s] impulse
  const BLAST_FORCE_PLAYER = 56000; // [N·s] stronger player recoil
  const BLAST_UP_BIAS    = 0.25;

  // Zombie w zasięgu → zabij
  for (const z of zombies) {
    if (!z.isAlive || !z.mesh) continue;
    const dx = z.mesh.position.x - ep.x;
    const dz = z.mesh.position.z - ep.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= BLAST_RADIUS) onZombieKill(z);
  }

  // NPC i gracz — obrażenia + fizyczny impuls
  const _carTargets = [
    { body: player.chassisBody, isPlayer: true },
    ...npcCars.filter(c => c !== npc && c.isAlive && c.chassisBody)
              .map(c => ({ body: c.chassisBody, npcRef: c })),
    ...(policeCar && policeCar !== npc && policeCar.isAlive && policeCar.chassisBody
      ? [{ body: policeCar.chassisBody, npcRef: policeCar }]
      : []),
  ];
  for (const t of _carTargets) {
    const body = t.body;
    if (!body) continue;
    const dx = body.position.x - ep.x;
    const dy = body.position.y - ep.y;
    const dz = body.position.z - ep.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > BLAST_RADIUS) continue;
    const falloff = Math.max(0, 1 - dist / BLAST_RADIUS);

    // Obrażenia
    if (t.isPlayer) {
      if (!player.supermanMode) {
        player.hp = Math.max(0, player.hp - Math.round(BLAST_DMG_PLAYER * falloff));
        hud.showMessage('💥 Fala uderzeniowa!', '#ff4444', 1000);
      }
    } else if (t.npcRef) {
      t.npcRef.hp = Math.max(0, t.npcRef.hp - Math.round(BLAST_DMG_NPC * falloff));
      if (t.npcRef.hp <= 0 && t.npcRef.isAlive) onCarKill(t.npcRef);
    }

    // Impuls fizyczny
    const strength = (t.isPlayer ? BLAST_FORCE_PLAYER : BLAST_FORCE) * falloff;
    const len = dist || 0.01;
    const nx = dx / len;
    const nz = dz / len;
    // Impuls w środku masy = 100% liniowy, 0% moment obrotowy
    body.applyImpulse(
      new CANNON.Vec3(
        nx * strength * (1 - BLAST_UP_BIAS),
        strength * BLAST_UP_BIAS,
        nz * strength * (1 - BLAST_UP_BIAS)
      )
    );
    // 1/9 obrotu do 9/9 kierunku
    body.angularVelocity.x += (Math.random() - 0.5) * (strength / 36000);
    body.angularVelocity.z += (Math.random() - 0.5) * (strength / 36000);
  }

  // Po wybuchu: popatrz o 1s dłużej przed powrotem do gracza.
  setTimeout(() => {
    if (!_winSequence) camCtrl.setState(CamState.PLAYER);
  }, 1250);

  timer.addTime(60);
  carKills++;
  addCredits(CREDITS_CAR_KILL, '🚗💥 +1:00', '#ffcc00');
  checkWinConditions();
  // brak respawnu po zabiciu — NPC odradzają się TYLKO po wyleceniu za planszę
}

function _respawnNPC(npc) {
  if (gameOverVisible) return;
  npc.respawn(scene, world, terrain);
  npc.onSmoke      = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
  npc.onFireExplode = () => onCarKill(npc);
  npc.onDestroy    = () => onCarKill(npc);
  npc.onBoundsExit = () => setTimeout(() => _respawnNPC(npc), 500);
}

function onCarKill(npc) {
  if (!npc.isAlive) return;
  if (!npc.isPolice) _raisePoliceAlarm(npc.chassisBody?.position);
  recorder?.onNpcDeath(npc);
  if (recorder && npc.chassisBody && player.chassisBody
      && npc.chassisBody.position.distanceTo(player.chassisBody.position) < 30) {
    recorder.reward({ npcIndex: npcCars.indexOf(npc) }, 3.0);
  }
  npc.isAlive  = false;
  npc._isDying = true;
  npc._dyingTimer     = 0;
  npc._dyingExplodeAt = 1.0 + Math.random() * 0.5; // 1-1.5s losowo
  audio.playOpponentKillStart();

  // Odetnij sterowanie natychmiast — zeruj silnik i hamulce
  if (npc.vehicle) {
    for (let i = 0; i < 4; i++) {
      npc.vehicle.applyEngineForce(0, i);
      npc.vehicle.setSteeringValue(0, i);
      npc.vehicle.setBrake(0, i);
    }
  }

  // Wymuś pełny ogień — natychmiastowy podar po trafieniu
  for (const key of Object.keys(npc.damageSystem.state)) {
    npc.damageSystem.state[key] = 1.0;
  }

  // Przekaż callback do NPCCar — wywołany po odliczeniu
  npc.onDyingExplode = (n, vx, vy, vz) => {
    n._isDying = false;
    _explodeNPC(n, vx, vy, vz);
  };

  // Uruchom kamerę orbit za NPC
  if (npc.group) {
    const dx = player.chassisBody ? player.chassisBody.position.x - npc.group.position.x : 0;
    const dz = player.chassisBody ? player.chassisBody.position.z - npc.group.position.z : 1;
    const orbitOffset = npc.chassisBody
      ? _getDestroyCamOrbitOffset(npc.chassisBody.velocity.x, npc.chassisBody.velocity.z)
      : { x: 0, y: 0, z: 0 };
    camCtrl.setState(CamState.NPC_DESTROY, {
      target:     npc.group,
      startAngle: Math.atan2(dx, dz),
      orbitOffset,
    });
  }
}

function onCarHit(damageDealt, npcMaxHp = 600, npc = null) {
  const earnedCr  = Math.max(1, Math.round(damageDealt * HP_TO_CREDIT));
  const earnedSec = Math.round(damageDealt * HP_TO_TIME);
  const npcIndex  = npc ? npcCars.indexOf(npc) : -1;
  if (npcIndex >= 0) recorder?.reward({ npcIndex }, Math.max(0.3, earnedSec / 20));
  if (earnedSec > 0) timer.addTime(earnedSec);
  const timeLabel = earnedSec > 0 ? ` +${earnedSec}s` : '';
  addCredits(earnedCr, `💥 hit${timeLabel}`, '#ffaa44');
  audio.playOpponentHitStrong(Math.min(1.0, damageDealt / 20));
}

// ── Collision handler — created in initWorld() ───────────────────

// ── Game Over ─────────────────────────────────────────────────────
let gameOverVisible   = false;
let _gameOverSequence = false; // true = czas się skończył, scena renderuje, gracz nie steruje
let _winSequence      = false;

function _triggerGameOverExplosion() {
  if (!player || _playerDead) return;
  const ep = player.chassisBody.position;
  const vel = player.chassisBody.velocity;

  // Eksplozja
  particles.spawnExplosion(ep.x, ep.y + 1, ep.z);
  audio.playCarExplosion();
  setTimeout(() => {
    particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.5, ep.y + 2.5, ep.z + (Math.random() - 0.5) * 1.5);
    particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.0, ep.y + 0.5, ep.z + (Math.random() - 0.5) * 1.0);
    audio.playCarExplosion();
  }, 250);

  // Gruz z dymem
  debris.spawn(
    ep.x, ep.y + 0.5, ep.z,
    vel.x, vel.y, vel.z,
    (x, y, z, type) => particles.spawnSmoke(x, y, z, type)
  );

  // Ukryj auto, wyłącz silnik
  player.group.visible = false;
  for (const wm of player.wheelMeshes) wm.visible = false;
  if (player.vehicle) {
    for (let i = 0; i < 4; i++) {
      player.vehicle.applyEngineForce(0, i);
      player.vehicle.setBrake(0, i);
    }
  }

  // Kamera orbit wokół punktu wybuchu (jak NPC_DESTROY, ale bez powrotu)
  camCtrl.setState(CamState.NPC_DESTROY, {
    anchor: { x: ep.x, y: ep.y, z: ep.z },
    orbitOffset: _getDestroyCamOrbitOffset(vel.x, vel.z),
  });

  audio.playGameOver();
}

timer.onGameOver = () => {
  if (_gameOverSequence || gameOverVisible) return;
  _gameOverSequence = true;

  _triggerGameOverExplosion();

  // Plansza pojawia się po 5s — scena renderuje się normalnie przez cały czas
  setTimeout(() => {
    const landingHref = window.location.pathname.includes('/dist/') ? '../landingPage.html' : './landingPage.html';
    gameOverVisible = true;
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.88);
      display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;`;
    el.innerHTML = `
      <div style="font-size:68px;font-weight:900;color:#ef4444;letter-spacing:4px;text-shadow:0 0 30px #ff0000;">GAME OVER</div>
      <div style="font-size:22px;color:#ccc;margin:16px 0 32px;">🧟 ${zombieKills} zombie &nbsp;|&nbsp; 🚗 ${carKills} auta &nbsp;|&nbsp; 💰 ${credits} CR</div>
      <button onclick="location.reload()"
        style="padding:14px 44px;font-size:18px;font-weight:800;background:#ef4444;color:#fff;
               border:none;border-radius:10px;cursor:pointer;letter-spacing:2px;">ZAGRAJ PONOWNIE</button>
      <button onclick="location.href='${landingHref}'"
        style="margin-top:12px;padding:10px 32px;font-size:14px;background:transparent;
               color:#888;border:1px solid #444;border-radius:8px;cursor:pointer;">\u2190 Arcade</button>
    `;
    document.body.appendChild(el);
  }, 5000);
};

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Respawn logic ───────────────────────────────────────────────
let _lastValidPos = null;
let _respawnCooldown = 0;

// ── Player death & respawn ───────────────────────────────────────
let _playerDead      = false;
let _playerDeathTimer = 0;
const PLAYER_RESPAWN_DELAY = 3.0; // [s]

function _onPlayerDeath() {
  if (_playerDead) return;
  recorder?.onDeath();
  _playerDead      = true;
  _playerDeathTimer = PLAYER_RESPAWN_DELAY;

  const ep = player.chassisBody.position;
  const ev = player.chassisBody.velocity;

  camCtrl.setState(CamState.NPC_DESTROY, {
    target: player.group,
    anchor: ep,
    velocity: ev,
    orbitOffset: _getDestroyCamOrbitOffset(ev.x, ev.z),
  });

  // Eksplozja jak NPC
  particles.spawnExplosion(ep.x, ep.y + 1, ep.z);
  particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.5, ep.y + 2.5, ep.z + (Math.random() - 0.5) * 1.5);
  particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.0, ep.y + 0.5, ep.z + (Math.random() - 0.5) * 1.0);
  audio.playCarExplosion();

  debris.spawn(
    ep.x, ep.y + 0.5, ep.z,
    ev.x, ev.y, ev.z,
    (x, y, z, type) => particles.spawnSmoke(x, y, z, type)
  );

  // Ukryj auto gracza
  player.group.visible = false;
  for (const wm of player.wheelMeshes) wm.visible = false;

  // Zatrzymaj silnik
  if (player.vehicle) {
    for (let i = 0; i < 4; i++) {
      player.vehicle.applyEngineForce(0, i);
      player.vehicle.setBrake(0, i);
    }
  }

  // Napis "ZGINĄŁEŚ"
  const _deathEl = document.createElement('div');
  _deathEl.id = '_playerDeathEl';
  _deathEl.style.cssText = `
    position:fixed;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;z-index:300;
    pointer-events:none;
  `;
  _deathEl.innerHTML = `
    <div style="font-size:72px;font-weight:900;color:#ef4444;
      text-shadow:0 0 40px #ff0000;letter-spacing:4px;animation:pulse 0.5s infinite alternate;">
      ZGINĄŁEŚ
    </div>
    <div id="_deathCountdown" style="font-size:28px;color:#ffcc00;margin-top:16px;font-family:monospace;">
      Respawn za ${PLAYER_RESPAWN_DELAY.toFixed(0)}s
    </div>
  `;
  document.body.appendChild(_deathEl);
}

function _doPlayerRespawn() {
  _playerDead = false;
  recorder?.onRespawn();

  // Losowa pozycja w promieniu 20m od centrum spawnu
  const cx = MAP.playerSpawn?.x ?? 0;
  const cz = MAP.playerSpawn?.z ?? 0;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 20;
  const rx = cx + Math.cos(angle) * radius;
  const rz = cz + Math.sin(angle) * radius;
  const ry = terrain.getHeightAt(rx, rz) + 1.5;

  player.chassisBody.position.set(rx, ry, rz);
  player.chassisBody.velocity.set(0, 0, 0);
  player.chassisBody.angularVelocity.set(0, 0, 0);
  player.chassisBody.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);

  // Pełny reset HP i uszkodzeń
  player.hp = player.maxHp;
  for (const key of Object.keys(player.damageSystem.state)) {
    player.damageSystem.state[key] = 0;
  }
  player.restoreDetachedWheels(true);

  // Pokaż auto
  player.group.visible = true;
  for (const wm of player.wheelMeshes) wm.visible = true;

  // Usuń overlay
  document.getElementById('_playerDeathEl')?.remove();

  _respawnCooldown = 120;
  camCtrl.setState(CamState.PLAYER);
  hud.showMessage('RESPAWN! 🔄', '#00ff88', 1800);
  audio.playRespawn();
  _lastValidPos = { x: rx, z: rz };
}

function _checkRespawn() {
  if (_playerDead) return;
  const pos = player.chassisBody.position;
  const BOUND = WORLD_SIZE * 0.5 + 5;
  const outOfBounds = Math.abs(pos.x) > BOUND || Math.abs(pos.z) > BOUND;
  const underground = pos.y < -3;

  if (_respawnCooldown > 0) { _respawnCooldown--; return; }

  if (outOfBounds || underground) {
    recorder?.onRespawn();
    // Teleport back to last valid position + 10m up
    const safeH = terrain.getHeightAt(_lastValidPos.x, _lastValidPos.z);
    player.chassisBody.position.set(_lastValidPos.x, safeH + 10, _lastValidPos.z);
    player.chassisBody.velocity.set(0, 0, 0);
    player.chassisBody.angularVelocity.set(0, 0, 0);
    player.chassisBody.quaternion.setFromEuler(0, 0, 0);
    _respawnCooldown = 120; // 2s cooldown
    hud.showMessage('RESPAWN!', '#ffaa00', 1500);
    audio.playRespawn();
  } else if (pos.y > terrain.getHeightAt(pos.x, pos.z) - 1) {
    // Only save valid position when above terrain
    _lastValidPos = { x: pos.x, z: pos.z };
  }
}

// ── Timer start ───────────────────────────────────────────────────
setTimeout(() => {
  timer.start();
  if (!isTouchDevice) hud.showMessage('WASD = jazda | Spacja = hamulec', '#fff', 3000);
  else hud.showMessage('Joystick = jazda | HAMUL = hamulec', '#fff', 3000);
}, 500);

// ── Game Loop ─────────────────────────────────────────────────────
const clock = new THREE.Clock();
const FIXED_DT = 1 / 120; // 2 substepy na klatkę @ 60fps — większa dokładność kolizji przy dużych prędkościach
let accumulator = 0;
let _landingArmed = false;
let _landingMinVelY = 0;
let _landingCooldown = 0;
let _airborneTime = 0;
let _longFlyPlayedThisAir = false;

const LANDING_ARM_HEIGHT = 1.4;
const LANDING_TRIGGER_HEIGHT = 0.9;
const LANDING_SOUND_VEL_THRESHOLD = 6.0;
const LANDING_SOUND_VEL_MAX = 18.0;
const LANDING_SOUND_COOLDOWN = 0.22;
const LONG_FLY_FORCE_TIME = 4.0;
const LONG_FLY_SPEED_THRESHOLD = 150;
const LONG_FLY_HEIGHT_THRESHOLD = 5.0;
const AIRBORNE_HEIGHT_THRESHOLD = 1.15;
const AIRBORNE_LOOSE_HEIGHT_THRESHOLD = 0.45;
const AIRBORNE_VEL_Y_THRESHOLD = 1.75;

// ── Mode Menu ─────────────────────────────────────────────────────
function showModeMenu() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:linear-gradient(160deg,#0a0a0a 0%,#1a0500 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    z-index:3000;color:#fff;font-family:system-ui,sans-serif;
  `;
  const btnStyle = `
    margin:10px;padding:18px 56px;font-size:20px;font-weight:800;
    border:none;border-radius:12px;cursor:pointer;letter-spacing:2px;
    transition:transform .12s,filter .12s;
  `;
  overlay.innerHTML = `
    <div style="font-size:52px;font-weight:900;color:#ff4400;text-shadow:0 0 30px #ff4400;letter-spacing:3px;margin-bottom:8px;">
      ZOMBIE RACER
    </div>
    <div style="color:#888;font-size:14px;margin-bottom:48px;letter-spacing:1px;">
      WYBIERZ TRYB
    </div>
    <button id="_btnSingle" style="${btnStyle}background:#00bb55;color:#fff;">
      🧟 SINGLE PLAYER
    </button>
    <div style="display:flex;gap:8px;align-items:center;margin:2px 0 6px;font-size:12px;color:#888;letter-spacing:1px;">
      OPONENCI:
      <button data-ai="classic" style="padding:8px 16px;font-weight:700;border-radius:8px;cursor:pointer;">KLASYCZNA AI</button>
      <button data-ai="learned" style="padding:8px 16px;font-weight:700;border-radius:8px;cursor:pointer;">🧠 UCZONA AI</button>
    </div>
    <div id="_aiInfo" style="font-size:12px;color:#666;margin-bottom:6px;max-width:460px;text-align:center;"></div>
    <label id="_aiRecordWrap" style="font-size:13px;color:#aaa;margin-bottom:18px;cursor:pointer;">
      <input type="checkbox" id="_aiRecord"> Nagrywaj moją jazdę do treningu AI
    </label>
  `;
  document.body.appendChild(overlay);

  // ── Wybór AI oponentów ──
  let aiMode = IS_LOCAL_AI_ENV && localStorage.getItem(AI_MODE_KEY) === 'learned' && TRAINED_MODEL
      ? 'learned'
      : 'classic';
  const aiInfo = overlay.querySelector('#_aiInfo');
  const aiButtons = overlay.querySelectorAll('[data-ai]');
  const learnedBtn = overlay.querySelector('[data-ai="learned"]');
  const aiModePicker = learnedBtn.parentElement;
  if (!TRAINED_MODEL) {
    learnedBtn.disabled = true;
    learnedBtn.style.opacity = '0.4';
    learnedBtn.style.cursor = 'not-allowed';
  }
  if (!CAN_RECORD) overlay.querySelector('#_aiRecordWrap').style.display = 'none';
  if (!IS_LOCAL_AI_ENV) aiModePicker.style.display = 'none';
  const renderAi = () => {
    aiButtons.forEach(b => {
      const on = b.dataset.ai === aiMode;
      b.style.background = on ? '#2266ff' : '#222';
      b.style.color = on ? '#fff' : '#aaa';
      b.style.border = on ? '2px solid #88aaff' : '2px solid #444';
    });
    const m = TRAINED_MODEL?.meta;
    aiInfo.textContent = aiMode === 'learned'
      ? `Model: ${m?.samples ?? '?'} próbek, trening ${m?.trainedAt?.slice(0, 16).replace('T', ' ') ?? '?'}`
      : TRAINED_MODEL ? 'Maszyna stanów: patrol, pościg, taran, ucieczka'
      : 'Brak modelu — pograj z nagrywaniem, potem: npm run train:ai';
  };
  aiButtons.forEach(b => {
    b.onclick = () => {
      if (b.disabled) return;
      aiMode = b.dataset.ai;
      localStorage.setItem(AI_MODE_KEY, aiMode);
      renderAi();
    };
  });
  renderAi();

  overlay.querySelector('#_btnSingle').onclick = () => {
    _recordDrive = CAN_RECORD && overlay.querySelector('#_aiRecord').checked;
    NPCCar.policy = null;
    if (aiMode === 'learned' && TRAINED_MODEL) {
      try {
        NPCCar.policy = new PolicyNet(TRAINED_MODEL);
      } catch (e) {
        aiInfo.textContent = e.message;
        aiInfo.style.color = '#ff6644';
        return;
      }
    }
    document.body.removeChild(overlay);
    showMapMenu();
  };
}

// ── Map Menu ──────────────────────────────────────────────────────
function showMapMenu() {
  const maps = loadSavedMaps();
  const mapNames = Object.keys(maps);
  if (mapNames.length === 0) {
    startGame();
    return;
  }

  const menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.top = '0';
  menu.style.left = '0';
  menu.style.width = '100%';
  menu.style.height = '100%';
  menu.style.background = 'rgba(0,0,0,0.8)';
  menu.style.color = 'white';
  menu.style.zIndex = '2000';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';
  menu.style.alignItems = 'center';
  menu.style.justifyContent = 'center';
  menu.innerHTML = '<h1>Wybierz Planszę</h1>';

  for (const name of mapNames) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.margin = '10px';
    btn.style.padding = '10px 20px';
    btn.onclick = () => {
      MAP = maps[name];
      document.body.removeChild(menu);
      startGame();
    };
    menu.appendChild(btn);
  }

  const defaultBtn = document.createElement('button');
  defaultBtn.textContent = 'Domyślna Plansza';
  defaultBtn.style.margin = '10px';
  defaultBtn.style.padding = '10px 20px';
  defaultBtn.onclick = () => {
    MAP = defaultMap;
    document.body.removeChild(menu);
    startGame();
  };
  menu.appendChild(defaultBtn);

  document.body.appendChild(menu);
}

function loadSavedMaps() {
  try {
    const maps = JSON.parse(localStorage.getItem('zombieRacerMaps') || '{}');
    return maps && typeof maps === 'object' && !Array.isArray(maps) ? maps : {};
  } catch {
    return {};
  }
}

function initWorld(mapData) {
  const playerSpawn  = mapData.playerSpawn  ?? { x: 0, z: 0 };
  const npcWaypoints = mapData.npcWaypoints ?? [];
  const zombieSpawns = mapData.zombieSpawns ?? [];

  city = new CityBuilder();
  city.build(scene, world, terrain, mapData);
  setObstacles(mapData);

  player = new PlayerCar();
  const spawnH = terrain.getHeightAt(playerSpawn.x, playerSpawn.z);
  player.build(scene, world, playerSpawn.x, spawnH + 0.9, playerSpawn.z, 0x00dd66);
  const npcColors = [0xcc2200, 0x2200cc, 0xcc8800, 0xaa00cc, 0x00aacc, 0xddcc00, 0x00cc44, 0xff6600, 0x8800cc, 0xcc0066];
  npcCars = [];
  for (let i = 0; i < Math.min(npcWaypoints.length, 10); i++) {
    const npc = new NPCCar(npcWaypoints[i], npcColors[i % npcColors.length]);
    npc.buildNPC(scene, world, terrain);
    npc.onSmoke       = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
    npc.onFireExplode = () => onCarKill(npc);
    npc.onDestroy     = () => onCarKill(npc);
    npc.onBoundsExit  = () => setTimeout(() => _respawnNPC(npc), 500);
    npcCars.push(npc);
  }

  if (npcWaypoints.length > 0) {
    const policeWaypoints = npcWaypoints.flatMap((route, routeIndex) =>
      route.map((waypoint, waypointIndex) => ({ waypoint, routeIndex, waypointIndex }))
    );
    const freePoliceWaypoints = policeWaypoints
      .filter(({ waypoint }) => {
        if (Math.hypot(waypoint.x - playerSpawn.x, waypoint.z - playerSpawn.z) < 45) return false;
        return npcCars.every(npc => Math.hypot(
          waypoint.x - npc.chassisBody.position.x,
          waypoint.z - npc.chassisBody.position.z
        ) > 32);
      });
    const policeSpawn = freePoliceWaypoints[(Math.random() * freePoliceWaypoints.length) | 0]
      ?? policeWaypoints.reduce((furthest, candidate) => {
        const nearest = npcCars.reduce((distance, npc) => Math.min(distance, Math.hypot(
          candidate.waypoint.x - npc.chassisBody.position.x,
          candidate.waypoint.z - npc.chassisBody.position.z
        )), Infinity);
        return nearest > furthest.distance ? { ...candidate, distance: nearest } : furthest;
      }, { ...policeWaypoints[0], distance: -Infinity });
    policeCar = new PoliceCar(npcWaypoints[policeSpawn.routeIndex]);
      policeCar.waypointIdx = Math.max(0, policeCar.waypointRoute.indexOf(policeSpawn.waypoint));
    policeCar.buildNPC(scene, world, terrain);
    policeCar.onSmoke = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
  }

  zombies = [];
  for (const sp of zombieSpawns) {
    for (let j = 0; j < 3; j++) {
      const ox = (Math.random() - 0.5) * 10;
      const oz = (Math.random() - 0.5) * 10;
      const z = new Zombie();
      const zh = terrain.getHeightAt(sp.x + ox, sp.z + oz) + 1.2;
      z.spawn(scene, world, sp.x + ox, zh, sp.z + oz);
      zombies.push(z);
    }
  }

  collisions = new CollisionHandler(world, player, zombies, [...npcCars, policeCar].filter(Boolean), timer, hud, audio, city, onZombieKill, onCarKill, onCarHit, {
    onNpcClash:    (npc, dmgP, dmgN) => recorder?.onNpcClash(npc, dmgP, dmgN, player.maxHp),
    onNpcObstacle: (npc, speed) => recorder?.onNpcObstacle(npc, speed),
    onChaosBarrel: _activateWorldModifier,
    onPoliceIncident: _raisePoliceAlarm,
  });
  _lastValidPos = { x: playerSpawn.x, z: playerSpawn.z };

}

function startGame() {
  if (_gameLoopStarted) return;
  initWorld(MAP);
  if (_recordDrive) recorder = new DriveRecorder();
  const label = NPCCar.policy ? 'AI: UCZONA 🧠' : 'AI: KLASYCZNA';
  setTimeout(() => hud.showMessage(`${label}${recorder ? '  ● REC' : ''}`, '#88ccff', 2500), 3600);
  _gameLoopStarted = true;
  requestAnimationFrame(gameLoop);
}

// ── Event Listeners ────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    const editor = new MapEditor();
    editor.show();
  }
});

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (gameOverVisible) return; // plansza widoczna — całkowite zatrzymanie

  const dt = Math.min(clock.getDelta(), 0.1);
  _tickWorldModifier(dt);
  accumulator += dt;

  // Podczas sekwencji game over: gracz nie steruje, ale scena się renderuje
  if (!_gameOverSequence && !_winSequence && !_playerDead) {
    player.update(input, dt);
  } else if (_playerDead) {
    player.sync(dt);
  }
  recorder?.tick(dt, player, input, npcCars, _playerDead || _gameOverSequence);

  while (accumulator >= FIXED_DT) {
    // ── Dynamiczne tłumienie obrotu — silniejsze przy szybkim kręceniu ──────
    const HIGH_SPIN = 3 * 2 * Math.PI; // 3 RPS w rad/s
    const _carBodies = [player.chassisBody, ...npcCars.map(c => c.chassisBody).filter(Boolean)];
    for (const cb of _carBodies) {
      if (!cb) continue;
      const spin = cb.angularVelocity.length();
      cb.angularDamping = spin > HIGH_SPIN ? 0.80 : 0.20; // 0.20 = 2× domyślna
    }
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  // Zsynchronizuj mesh gracza z pozycją po fizyce (dt=0 by nie dublować efektów czasowych)
  player.sync(0);

  if (!_gameOverSequence) {
    // ── Healing — każde wciśnięcie Backspace = 1 leczenie instant ──
    while (input.consumeHeal()) {
      if (credits >= CREDITS_HEAL_COST) {
        credits -= CREDITS_HEAL_COST;
        recorder?.onHeal();
        player.hp = Math.min(player.maxHp, player.hp + HEAL_AMOUNT);
        audio.playHeal();
        const ratio = player.hp / player.maxHp;
        for (const key of Object.keys(player.damageSystem.state)) {
          player.damageSystem.state[key] *= (1 - ratio * 0.3);
        }
        player.restoreDetachedWheels(true);
        hud.showMessage(`-${CREDITS_HEAL_COST} CR  ❤️ +${HEAL_AMOUNT} HP`, '#ff88aa', 1500);
      } else {
        hud.showMessage('Za mało creditów!', '#ff4444', 1000);
        break; // nie próbuj kolejnych jeśli brak kasy
      }
    }
    _checkRespawn();

    // Krew na czerwono: poniżej 20% życia traci 1 HP/s (gwarantowana śmierć)
    if (!_playerDead && !player.supermanMode && player.hp > 0 && player.hp < player.maxHp * 0.20) {
      player.hp = Math.max(0, player.hp - dt);
    }

    // ── Śmierć gracza ─────────────────────────────────────────────
    if (!_playerDead && player.hp <= 0) {
      _onPlayerDeath();
    }
    if (_playerDead) {
      _playerDeathTimer -= dt;
      // Aktualizuj odliczanie na ekranie
      const cdEl = document.getElementById('_deathCountdown');
      if (cdEl) cdEl.textContent = `Respawn za ${Math.max(0, _playerDeathTimer).toFixed(1)}s`;
      if (_playerDeathTimer <= 0) _doPlayerRespawn();
      // NIE przerywamy pętli — particles/debris/kamera kontynuują się renderować
    }

    // Respawn manualny klawiszem Insert — reset w aktualnym miejscu
    if (input.insertPressed && _respawnCooldown <= 0) {
      recorder?.onRespawn();
      const p = player.chassisBody.position;
      const safeH = terrain.getHeightAt(p.x, p.z);
      player.chassisBody.position.set(p.x, safeH + 2, p.z);
      player.chassisBody.velocity.set(0, 0, 0);
      player.chassisBody.angularVelocity.set(0, 0, 0);
      player.chassisBody.quaternion.setFromEuler(0, 0, 0);
      _respawnCooldown = 120;
      hud.showMessage('RESPAWN LOKALNY!', '#ffaa00', 1500);
      audio.playRespawn();
    }

    // Respawn manualny klawiszem Home — powrót na start
    if (input.homePressed && _respawnCooldown <= 0) {
      recorder?.onRespawn();
      const safeH = terrain.getHeightAt(MAP.playerSpawn.x, MAP.playerSpawn.z);
      player.chassisBody.position.set(MAP.playerSpawn.x, safeH + 10, MAP.playerSpawn.z);
      player.chassisBody.velocity.set(0, 0, 0);
      player.chassisBody.angularVelocity.set(0, 0, 0);
      player.chassisBody.quaternion.setFromEuler(0, 0, 0);
      _respawnCooldown = 120;
      hud.showMessage('RESPAWN!', '#ffaa00', 1500);
      audio.playRespawn();
    }
  } // end !_gameOverSequence

  for (const npc of npcCars) {
    if (npc.isAlive) {
      npc.update(terrain, player.chassisBody.position, player.chassisBody.velocity, npcCars, dt,
                 !_playerDead && !_gameOverSequence);
      // Krew na czerwono: poniżej 20% życia traci 1 HP/s (gwarantowana śmierć)
      if (npc.hp > 0 && npc.hp < npc.maxHp * 0.20) {
        npc.hp = Math.max(0, npc.hp - dt);
        if (npc.hp <= 0 && npc.isAlive) onCarKill(npc);
      }
    } else if (npc._isDying) {
      npc.updateDying(dt);
    } else if (npc._ghostTimer > 0) {
      // Ghost mode: czyszczenie meshy — body już usunięte w _explodeNPC
      npc._ghostTimer -= dt;
      if (npc._ghostTimer <= 0) {
        // Sprzątanie po ghost mode — body już nie ma
        if (npc.group) scene.remove(npc.group);
        for (const wm of npc.wheelMeshes) scene.remove(wm);
        npc.wheelMeshes = [];
      }
    }
  }

  if (policeCar) {
    if (policeCar.isAlive) {
      policeCar.update(terrain, player.chassisBody.position, player.chassisBody.velocity, [...npcCars, policeCar], dt,
        !_playerDead && !_gameOverSequence);
      if (policeCar.sirenPulse) audio.playPoliceSiren();
    } else if (policeCar._isDying) {
      policeCar.updateDying(dt);
    } else if (policeCar._ghostTimer > 0) {
      policeCar._ghostTimer -= dt;
      if (policeCar._ghostTimer <= 0) {
        scene.remove(policeCar.group);
        for (const wheel of policeCar.wheelMeshes) scene.remove(wheel);
        policeCar.wheelMeshes = [];
      }
    }
  }

  for (const z of zombies) {
    if (z.isAlive) z.update(dt);
  }
  recorder?.tickNpcs(dt, npcCars, player, !_playerDead && !_gameOverSequence);

  particles.update(dt);
  debris.update(dt);
  city.tick(dt);
  timer.update(dt);
  collisions.tick(dt);
  if (_landingCooldown > 0) _landingCooldown -= dt;

  // ── Kamera — CameraController obsługuje oba stany ────────────────
  const speedKmh = player.chassisBody ? player.chassisBody.velocity.length() * 3.6 : 0;
  const engineDmgPct = player.damageSystem.getTotalDamagePercent();
  const velY = player.chassisBody ? player.chassisBody.velocity.y : 0;
  const angularSpeed = player.chassisBody ? player.chassisBody.angularVelocity.length() : 0;
  const groundY = player.chassisBody ? terrain.getHeightAt(player.chassisBody.position.x, player.chassisBody.position.z) : 0;
  const heightAboveGround = player.chassisBody ? player.chassisBody.position.y - groundY : 0;
  const hasWheelContact = player.vehicle ? player.wheelsOnGround : true;
  const isAirborne = Boolean(player.chassisBody) && (
    heightAboveGround >= AIRBORNE_HEIGHT_THRESHOLD ||
    (!hasWheelContact && heightAboveGround >= AIRBORNE_LOOSE_HEIGHT_THRESHOLD) ||
    (heightAboveGround >= AIRBORNE_LOOSE_HEIGHT_THRESHOLD && Math.abs(velY) >= AIRBORNE_VEL_Y_THRESHOLD)
  );

  camCtrl.update(dt, {
    group:      player.group,
    throttle:   input.throttle,
    boostLevel: player._boostLevel,
    velocity:   player.chassisBody?.velocity,
    isAirborne,
  });

  if (isAirborne) {
    _airborneTime += dt;

    const hasLongFlyFlag = _airborneTime >= LONG_FLY_FORCE_TIME
      && heightAboveGround >= LONG_FLY_HEIGHT_THRESHOLD
      && speedKmh >= LONG_FLY_SPEED_THRESHOLD;

    if (!_longFlyPlayedThisAir && hasLongFlyFlag) {
      _longFlyPlayedThisAir = true;
      audio.playLongFly();
    }
  } else {
    _airborneTime = 0;
    _longFlyPlayedThisAir = false;
  }

  if (player.chassisBody) {
    if (isAirborne || heightAboveGround > LANDING_ARM_HEIGHT) {
      _landingArmed = true;
      _landingMinVelY = Math.min(_landingMinVelY, velY);
    }

    const touchedGround = heightAboveGround <= LANDING_TRIGGER_HEIGHT && velY > -1.0;
    if (_landingArmed && touchedGround && _landingCooldown <= 0) {
      const landingSpeed = Math.abs(_landingMinVelY);
      if (landingSpeed >= LANDING_SOUND_VEL_THRESHOLD) {
        const landingIntensity = Math.min(
          1,
          (landingSpeed - LANDING_SOUND_VEL_THRESHOLD) / (LANDING_SOUND_VEL_MAX - LANDING_SOUND_VEL_THRESHOLD)
        );
        audio.playImpact(landingIntensity);
        _landingCooldown = LANDING_SOUND_COOLDOWN;
      }
      _landingArmed = false;
      _landingMinVelY = 0;
    }

    if (!_landingArmed) {
      _landingMinVelY = Math.min(0, velY);
    }
  }

  // ── Etapowy dym: biały (45%+) → czarny (62%+) → ogień+czarny (78%+) + plamy oleju ──
  const smokeLevel = player.damageSystem.getSmokeLevel();
  if (smokeLevel > 0.45 && player.chassisBody) {
    _smokeTimer += dt;
    let smokeType, interval;
    if (smokeLevel >= 0.78) {
      smokeType = Math.random() > 0.45 ? 'fire' : 'black';
      interval  = 0.04;
    } else if (smokeLevel >= 0.62) {
      smokeType = 'black';
      interval  = 0.10;
    } else {
      smokeType = 'white';
      interval  = 0.20;
    }
    if (_smokeTimer >= interval) {
      _smokeTimer = 0;
      const p = player.group.position;
      // Dym z maski (przód auta w world space)
      _smokeOffset.set(0, 0.5, 1.55).applyQuaternion(player.group.quaternion);
      particles.spawnSmoke(p.x + _smokeOffset.x, p.y + _smokeOffset.y, p.z + _smokeOffset.z, smokeType);
    }
    // Plamy oleju — tylko gdy bardzo uszkodzony i jedzie
    _oilTimer += dt;
    if (smokeLevel >= 0.78 && speedKmh > 5 && _oilTimer >= 1.8) {
      _oilTimer = 0;
      const p = player.group.position;
      particles.spawnSmoke(p.x, p.y + 0.05, p.z, 'oilspot');
    }
  } else {
    _smokeTimer = 0;
  }

  // ── Audio ──
  const boostActive = player.boostActive || player.rocketBoostActive;
  const boostLevel = player.rocketBoostActive ? 1 : player._boostLevel;
  audio.updateEngine(speedKmh, input.throttle, boostLevel, engineDmgPct, player.hp / player.maxHp);
  if (boostActive && !_prevBoostActive) audio.playBoostStart();
  if (!boostActive && _prevBoostActive && player._boostFuel <= 0.01) audio.playBoostEmpty();
  _prevBoostActive = boostActive;

  hud.update(timer.getDisplay(), zombieKills, carKills, player.hp, credits, speedKmh, player._boostFuel, boostActive, player.rocketBoostSeconds, player.rocketBoostActive);
  damageOverlay.update(player.damageSystem.state);
  const q = player.chassisBody.quaternion;
  const playerYaw = Math.atan2(
    2 * (q.w * q.y + q.x * q.z),
    1 - 2 * (q.y * q.y + q.z * q.z)
  );
  minimap?.update(player.chassisBody.position, playerYaw, npcCars);

  hueShiftPass.uniforms.time.value += dt;
  composer.render();
}

showModeMenu();
