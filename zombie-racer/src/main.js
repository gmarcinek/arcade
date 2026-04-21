import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPhysicsWorld } from './physics/PhysicsWorld.js';
import { Terrain } from './world/Terrain.js';
import { CityBuilder } from './world/CityBuilder.js';
import { PlayerCar } from './car/PlayerCar.js';
import { Car } from './car/Car.js';
import { NPCCar } from './entities/NPCCar.js';
import { Zombie } from './entities/Zombie.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { TouchInput } from './input/TouchInput.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { GameTimer } from './systems/GameTimer.js';
import { CollisionHandler } from './systems/CollisionHandler.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { DamageOverlay } from './ui/DamageOverlay.js';
import { ParticleSystem } from './effects/ParticleSystem.js';
import { DebrisSystem } from './effects/DebrisSystem.js';
import { MAP } from './world/mapData.js';
import { WORLD_SIZE } from './constants.js';
import suvModelUrl from './assets/suv.glb?url';
import { BOOST_FOV_NORMAL, BOOST_FOV_ACTIVE, BOOST_FOV_LERP, CAMERA_OFFSET_BEHIND, CAMERA_OFFSET_UP } from './physicsConfig.js';
import { AudioManager } from './audio/AudioManager.js';

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

// ── Scene ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 260, WORLD_SIZE * 0.9);

// ── Lighting ──────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xc8d8ff, 0.50));   // chłodny ambient (niebo)

// Słońce główne (ciepłe, cienie)
const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
sun.position.set(50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = WORLD_SIZE;
sun.shadow.camera.left = sun.shadow.camera.bottom = -WORLD_SIZE * 0.5;
sun.shadow.camera.right = sun.shadow.camera.top = WORLD_SIZE * 0.5;
scene.add(sun);

// Fill light (miękki, z lewej) — wypełnia cień po prawej stronie auta
const fill = new THREE.DirectionalLight(0xaabbff, 0.35);
fill.position.set(-60, 30, 0);
scene.add(fill);

// Rim light (zimny niebieski, z tyłu) — podkreśla krawędzie clearcoat
const rim = new THREE.DirectionalLight(0x88bbff, 0.25);
rim.position.set(0, 10, -80);
scene.add(rim);

renderer.toneMappingExposure = 1.05;

// ── Camera ────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);

// ── Physics ───────────────────────────────────────────────────────
const world = createPhysicsWorld();

// ── World building ────────────────────────────────────────────────
const terrain = new Terrain();
terrain.build(scene, world);

const city = new CityBuilder();
city.build(scene, world, terrain);

// ── Input ─────────────────────────────────────────────────────────
// pointer: coarse = palec/rysik (prawdziwy dotyk); fine = myszka/touchpad
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const input = isTouchDevice ? new TouchInput() : new KeyboardInput();

// ── Player ────────────────────────────────────────────────────────
const player = new PlayerCar();
const spawnH = terrain.getHeightAt(MAP.playerSpawn.x, MAP.playerSpawn.z);
player.build(scene, world, MAP.playerSpawn.x, spawnH + 0.9, MAP.playerSpawn.z, 0x00dd66);

// ── NPC Cars ──────────────────────────────────────────────────────
const npcCars = [];
const npcColors = [0xcc2200, 0x2200cc, 0xcc8800, 0xaa00cc, 0x00aacc, 0xddcc00, 0x00cc44, 0xff6600, 0x8800cc, 0xcc0066];
for (let i = 0; i < Math.min(MAP.npcWaypoints.length, 10); i++) {
  const npc = new NPCCar(MAP.npcWaypoints[i], npcColors[i % npcColors.length]);
  npc.buildNPC(scene, world, terrain);
  npc.onSmoke = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
  npc.onFireExplode = () => onCarKill(npc); // równoznaczne — startuje fazę dying
  npcCars.push(npc);
}

// ── Zombies ───────────────────────────────────────────────────────
const zombies = [];
for (const sp of MAP.zombieSpawns) {
  for (let j = 0; j < 3; j++) {
    const ox = (Math.random() - 0.5) * 10;
    const oz = (Math.random() - 0.5) * 10;
    const z = new Zombie();
    const zh = terrain.getHeightAt(sp.x + ox, sp.z + oz) + 1.2;
    z.spawn(scene, world, sp.x + ox, zh, sp.z + oz);
    zombies.push(z);
  }
}

// ── Systems ───────────────────────────────────────────────────────
const particles = new ParticleSystem(scene);
const debris    = new DebrisSystem(scene, world);
const thirdPersonCam = new ThirdPersonCamera(camera);
const timer = new GameTimer();
const hud     = new HUD();
const minimap = new Minimap();
const damageOverlay = new DamageOverlay();
const audio = new AudioManager();

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
      <table style="margin:0 auto;border-collapse:collapse;font-size:17px;color:#ddd;">
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">↑ ↓ ← →</kbd></td><td style="color:#aaa;">Jedź</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Shift</kbd></td><td style="color:#aaa;">TURBO</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Backspace</kbd></td><td style="color:#aaa;">Reperowanie <span style="color:#666;font-size:13px;">(-50 CR)</span></td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Insert</kbd></td><td style="color:#aaa;">Respawn tu i teraz</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Home</kbd></td><td style="color:#aaa;">Powrót na start</td></tr>
      </table>
      <div style="margin-top:28px;font-size:14px;color:#555;letter-spacing:1px;">NACIŚNIJ DOWOLNY KLAWISZ LUB KLIKNIJ</div>
    </div>
  </div>
`;
document.body.appendChild(_controlsOverlay);
const _dismissOverlay = () => { _controlsOverlay.remove(); };

const _startAudio = () => { audio.start(); window.removeEventListener('keydown', _startAudio); window.removeEventListener('touchstart', _startAudio); window.removeEventListener('click', _startAudio); };
window.addEventListener('keydown',   _startAudio);
window.addEventListener('touchstart', _startAudio);
window.addEventListener('click',      _startAudio);
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

// ── Kill-cam state ──────────────────────────────────────────
const KILLCAM_ORBIT_DIST   = 20;    // [m] odległość kamery od NPC
const KILLCAM_ORBIT_HEIGHT = 3.5;  // [m] wysokość nad NPC
const KILLCAM_ORBIT_SPEED  = 0.45; // [rad/s] prędkość obrotu
const KILLCAM_FOV_WATCH    = 90;   // FOV podczas obserwacji
const KILLCAM_RETURN_TIME  = 3.5;  // [s] czas powrotu do gracza
const _killCamPos = new THREE.Vector3();
let _killCam = {
  active:      false,
  phase:       'watch', // 'watch' | 'return'
  target:      null,    // THREE.Group obserwowanego NPC
  orbitAngle:  0,
  returnTimer: 0,
  fov:         BOOST_FOV_NORMAL,
  lastLookX:   0,  // ostatni look target (do sync przy powrócie)
  lastLookY:   0,
  lastLookZ:   0,
};

const CREDITS_ZOMBIE    = 200;   // za rozjechanie zombie (było 50)
const CREDITS_CAR_HIT   =  30;   // za uderzenie w NPC (per collision)
const CREDITS_CAR_KILL  = 200;   // za zniszczenie NPC auta
const CREDITS_HEAL_COST =  50;   // koszt leczenia
const HEAL_AMOUNT       =  30;   // ile HP odzyskujemy

function addCredits(amount, label, color) {
  credits += amount;
  hud.showMessage(`${amount >= 0 ? '+' : ''}${amount} CR  ${label}`, color, 1200);
}

function onZombieKill(zombie) {
  zombie.kill(scene, world);
  timer.addTime(20);
  zombieKills++;
  addCredits(CREDITS_ZOMBIE, '🧟 +20s', '#44ff44');
  const pos = zombie.mesh ? zombie.mesh.position : { x: 0, z: 0 };
  particles.spawnBloodSplatter(pos.x, 1, pos.z);
  audio.playZombieHit();
  checkWinConditions();
}

function showWin(reason) {
  if (gameOverVisible) return;
  gameOverVisible = true;
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
    <button onclick="location.href='../index.html'"
      style="margin-top:12px;padding:10px 32px;font-size:14px;background:transparent;
             color:#888;border:1px solid #444;border-radius:8px;cursor:pointer;">← Arcade</button>
  `;
  document.body.appendChild(el);
}

function checkWinConditions() {
  if (gameOverVisible) return;
  const aliveNpcs = npcCars.filter(c => c.isAlive).length;
  if (aliveNpcs === 0) { showWin('Wszystkich oponentów zniszczono! 🚗💥'); return; }
  const aliveZombies = zombies.filter(z => z.isAlive).length;
  if (aliveZombies === 0) { showWin('Wszystkie zombie rozjechane! 🧟💀'); }
}

function _explodeNPC(npc, velX = 0, velY = 0, velZ = 0) {
  // Pobierz pozycję PRZED destroy
  const ep = npc.chassisBody
    ? { x: npc.chassisBody.position.x, y: npc.chassisBody.position.y, z: npc.chassisBody.position.z }
    : (npc.group ? { x: npc.group.position.x, y: npc.group.position.y, z: npc.group.position.z } : null);
  if (!ep) return;

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

  // ── Blast wave — odpycha wszystko w promieniu 5m, siła malejąca z dystansem ──
  const BLAST_RADIUS  = 10;   // [m] — maksymalny zasięg
  const BLAST_FORCE   = 2800; // [N·s] — impulse przy epicentrum (dist=0)
  const BLAST_UP_BIAS = 0.25;  // udział siły skierowanej w górę
  const _targets = [
    player.chassisBody,
    ...npcCars.filter(c => c !== npc && c.chassisBody).map(c => c.chassisBody),
  ];
  for (const body of _targets) {
    if (!body) continue;
    const dx = body.position.x - ep.x;
    const dy = body.position.y - ep.y;
    const dz = body.position.z - ep.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > BLAST_RADIUS) continue;
    // Siła = pełna przy 0m, zerowa przy BLAST_RADIUS (linear falloff)
    const strength = BLAST_FORCE * Math.max(0, 1 - dist / BLAST_RADIUS);
    const len = dist || 0.01;
    // Kierunek: od epicentrum + bias ku górze
    const nx = dx / len;
    const nz = dz / len;
    body.applyImpulse(
      new CANNON.Vec3(
        nx * strength * (1 - BLAST_UP_BIAS),
        strength * BLAST_UP_BIAS,
        nz * strength * (1 - BLAST_UP_BIAS)
      ),
      new CANNON.Vec3(
        body.position.x + (Math.random() - 0.5) * 0.6,
        body.position.y,
        body.position.z + (Math.random() - 0.5) * 0.6
      )
    );
    // Losowy spin — wywraca auto
    body.angularVelocity.x += (Math.random() - 0.5) * (strength / 4000);
    body.angularVelocity.z += (Math.random() - 0.5) * (strength / 4000);
  }

  // Zniszcz fizykę auta (model już nie będzie widoczny)
  if (npc.vehicle) npc.destroy(world, scene);

  // Po wybuchu: przełącz kill-cam na powrót do gracza
  if (_killCam.active && _killCam.phase === 'watch') {
    setTimeout(() => {
      thirdPersonCam.syncFromKillCam(
        _killCam.lastLookX, _killCam.lastLookY, _killCam.lastLookZ,
        player.group
      );
      _killCam.phase       = 'return';
      _killCam.returnTimer = 0;
      _killCam.target      = null;
    }, 1500);
  }

  timer.addTime(80);
  carKills++;
  addCredits(CREDITS_CAR_KILL, '🚗💥 +80s', '#ffcc00');
  checkWinConditions();

  // Odradzaj NPC po 8–12s (gra nie kończy się przez brak NPCów)
  setTimeout(() => _respawnNPC(npc), 8000 + Math.random() * 4000);
}

function _respawnNPC(npc) {
  if (gameOverVisible) return;
  npc.respawn(scene, world, terrain);
  npc.onSmoke       = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
  npc.onFireExplode = () => onCarKill(npc);
  hud.showMessage('NPC ↩ odrodzony', '#ffaa44', 1200);
}

function onCarKill(npc) {
  if (!npc.isAlive) return;
  npc.isAlive  = false;
  npc._isDying = true;
  npc._dyingTimer     = 0;
  npc._dyingExplodeAt = 2.0 + Math.random() * 1.0; // 2-3s losowo

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

  // Uruchom kill-cam: kamera skacze za NPC i obserwuje do wybuchu
  if (npc.group) {
    _killCam.active      = true;
    _killCam.phase       = 'watch';
    _killCam.target      = npc.group;
    _killCam.returnTimer = 0;
    _killCam.fov         = camera.fov;
    // Orbit startuje od strony gracza, żeby nie skakać nagle
    const dx = player.chassisBody
      ? player.chassisBody.position.x - npc.group.position.x : 0;
    const dz = player.chassisBody
      ? player.chassisBody.position.z - npc.group.position.z : 1;
    _killCam.orbitAngle = Math.atan2(dx, dz);
  }
}

function onCarHit(damageDealt) {
  const earned = Math.max(1, Math.round(damageDealt));
  addCredits(earned, '💥 hit', '#ffaa44');
  audio.playImpact(Math.min(1.0, damageDealt / 20));
}

// ── Collision handler ─────────────────────────────────────────────
const collisions = new CollisionHandler(world, player, zombies, npcCars, timer, hud, audio, city, onZombieKill, onCarKill, onCarHit);

// ── Game Over ─────────────────────────────────────────────────────
let gameOverVisible = false;

timer.onGameOver = () => {
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
    <button onclick="location.href='../index.html'"
      style="margin-top:12px;padding:10px 32px;font-size:14px;background:transparent;
             color:#888;border:1px solid #444;border-radius:8px;cursor:pointer;">\u2190 Arcade</button>
  `;
  document.body.appendChild(el);
};

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Respawn logic ───────────────────────────────────────────────
let _lastValidPos = { x: MAP.playerSpawn.x, z: MAP.playerSpawn.z };
let _respawnCooldown = 0;

function _checkRespawn() {
  const pos = player.chassisBody.position;
  const BOUND = WORLD_SIZE * 0.5 + 5;
  const outOfBounds = Math.abs(pos.x) > BOUND || Math.abs(pos.z) > BOUND;
  const underground = pos.y < -3;

  if (_respawnCooldown > 0) { _respawnCooldown--; return; }

  if (outOfBounds || underground) {
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
const FIXED_DT = 1 / 60;
let accumulator = 0;

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (gameOverVisible) return;

  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt;

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

  player.update(input, dt);

  // ── Healing — każde wciśnięcie Backspace = 1 leczenie instant ──
  while (input.consumeHeal()) {
    if (credits >= CREDITS_HEAL_COST) {
      credits -= CREDITS_HEAL_COST;
      player.hp = Math.min(player.maxHp, player.hp + HEAL_AMOUNT);
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

  // Respawn manualny klawiszem Insert — reset w aktualnym miejscu
  if (input.insertPressed && _respawnCooldown <= 0) {
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
    const safeH = terrain.getHeightAt(MAP.playerSpawn.x, MAP.playerSpawn.z);
    player.chassisBody.position.set(MAP.playerSpawn.x, safeH + 10, MAP.playerSpawn.z);
    player.chassisBody.velocity.set(0, 0, 0);
    player.chassisBody.angularVelocity.set(0, 0, 0);
    player.chassisBody.quaternion.setFromEuler(0, 0, 0);
    _respawnCooldown = 120;
    hud.showMessage('RESPAWN!', '#ffaa00', 1500);
    audio.playRespawn();
  }

  for (const npc of npcCars) {
    if (npc.isAlive) {
      npc.update(terrain, player.chassisBody.position, player.chassisBody.velocity, npcCars);
    } else if (npc._isDying) {
      npc.updateDying(dt);
    }
  }

  for (const z of zombies) {
    if (z.isAlive) z.update(dt);
  }

  particles.update(dt);
  debris.update(dt);
  city.tick(dt);
  timer.update(dt);
  collisions.tick(dt);

  // ── Kill-cam: obserwacja NPC lub powrót do gracza ──────────────────
  if (_killCam.active) {
    if (_killCam.phase === 'watch' && _killCam.target) {
      // Orbit wokół NPC
      _killCam.orbitAngle += KILLCAM_ORBIT_SPEED * dt;
      const tp = _killCam.target.position;
      _killCamPos.set(
        tp.x - Math.sin(_killCam.orbitAngle) * KILLCAM_ORBIT_DIST,
        tp.y + KILLCAM_ORBIT_HEIGHT,
        tp.z - Math.cos(_killCam.orbitAngle) * KILLCAM_ORBIT_DIST
      );
      camera.position.lerp(_killCamPos, 0.01);
      // Zapisz look target do sync przy powrócie
      _killCam.lastLookX = tp.x;
      _killCam.lastLookY = tp.y + 1.2;
      _killCam.lastLookZ = tp.z;
      camera.lookAt(tp.x, tp.y + 1.2, tp.z);
      // FOV płynnie do KILLCAM_FOV_WATCH
      _killCam.fov += (KILLCAM_FOV_WATCH - _killCam.fov) * 0.01;
      camera.fov = _killCam.fov;
      camera.updateProjectionMatrix();
    } else if (_killCam.phase === 'return') {
      // Oddaj kamerę graczowi — thirdPersonCam płynnie ją przyciągnie
      _killCam.returnTimer += dt;
      thirdPersonCam.update(player.group, input.throttle, player._boostLevel, CAMERA_OFFSET_BEHIND, false, player.chassisBody?.velocity, dt);
      _killCam.fov += (BOOST_FOV_NORMAL - _killCam.fov) * 0.01;
      camera.fov = _killCam.fov;
      camera.updateProjectionMatrix();
      if (_killCam.returnTimer >= KILLCAM_RETURN_TIME
          && Math.abs(_killCam.fov - BOOST_FOV_NORMAL) < 0.5) {
        _killCam.active = false;
        _killCam.target = null;
      }
    }
  } else {
    const _isAirborne = player.vehicle ? !player.wheelsOnGround : false;
    thirdPersonCam.update(player.group, input.throttle, player._boostLevel, CAMERA_OFFSET_BEHIND, _isAirborne, player.chassisBody?.velocity, dt);
    // ── Boost FOV (tylko poza kill-cam) ──
    const targetFov = BOOST_FOV_NORMAL + (BOOST_FOV_ACTIVE - BOOST_FOV_NORMAL) * player._boostLevel;
    camera.fov += (targetFov - camera.fov) * BOOST_FOV_LERP;
    camera.updateProjectionMatrix();
  }

  const speedKmh = player.chassisBody ? player.chassisBody.velocity.length() * 3.6 : 0;
  const engineDmgPct = player.damageSystem.getTotalDamagePercent();

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
  audio.updateEngine(speedKmh, input.throttle, player._boostLevel, engineDmgPct);
  if (player.boostActive && !_prevBoostActive) audio.playBoostStart();
  if (!player.boostActive && _prevBoostActive && player._boostFuel <= 0.01) audio.playBoostEmpty();
  _prevBoostActive = player.boostActive;

  hud.update(timer.getDisplay(), zombieKills, carKills, player.hp, credits, speedKmh, player._boostFuel, player.boostActive);
  damageOverlay.update(player.damageSystem.state);
  const q = player.chassisBody.quaternion;
  const playerYaw = Math.atan2(
    2 * (q.w * q.y + q.x * q.z),
    1 - 2 * (q.y * q.y + q.z * q.z)
  );
  minimap.update(player.chassisBody.position, playerYaw, npcCars);

  renderer.render(scene, camera);
}

gameLoop();
