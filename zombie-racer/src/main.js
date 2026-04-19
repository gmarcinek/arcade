import * as THREE from 'three';
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
import { DamageOverlay } from './ui/DamageOverlay.js';
import { ParticleSystem } from './effects/ParticleSystem.js';
import { MAP } from './world/mapData.js';
import suvModelUrl from './assets/suv.glb?url';
import { BOOST_FOV_NORMAL, BOOST_FOV_ACTIVE, BOOST_FOV_LERP } from './physicsConfig.js';

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
scene.fog = new THREE.Fog(0x87ceeb, 200, 600);

// ── Lighting ──────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xc8d8ff, 0.50));   // chłodny ambient (niebo)

// Słońce główne (ciepłe, cienie)
const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
sun.position.set(50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
sun.shadow.camera.left = sun.shadow.camera.bottom = -400;
sun.shadow.camera.right = sun.shadow.camera.top = 400;
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
const npcColors = [0xcc2200, 0x2200cc, 0xcc8800, 0xaa00cc, 0x00aacc];
for (let i = 0; i < Math.min(MAP.npcWaypoints.length, 5); i++) {
  const npc = new NPCCar(MAP.npcWaypoints[i], npcColors[i % npcColors.length]);
  npc.buildNPC(scene, world, terrain);
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
const thirdPersonCam = new ThirdPersonCamera(camera);
const timer = new GameTimer();
const hud = new HUD();
const damageOverlay = new DamageOverlay();

let zombieKills = 0;
let carKills = 0;
let credits = 0;

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

function onCarKill(npc) {
  npc.isAlive = false;
  particles.spawnExplosion(npc.group.position.x, npc.group.position.y + 1, npc.group.position.z);
  npc.destroy(world, scene);
  timer.addTime(80);
  carKills++;
  addCredits(CREDITS_CAR_KILL, '🚗💥 +80s', '#ffcc00');
  checkWinConditions();
}

function onCarHit(damageDealt) {
  // Kredyty = rzeczywiste HP zadane oponentowi
  const earned = Math.max(1, Math.round(damageDealt));
  addCredits(earned, '💥 hit', '#ffaa44');
}

// ── Collision handler ─────────────────────────────────────────────
const collisions = new CollisionHandler(world, player, zombies, npcCars, timer, hud, onZombieKill, onCarKill, onCarHit);

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
  const BOUND = 405;
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
      hud.showMessage(`-${CREDITS_HEAL_COST} CR  ❤️ +${HEAL_AMOUNT} HP`, '#ff88aa', 1500);
    } else {
      hud.showMessage('Za mało creditów!', '#ff4444', 1000);
      break; // nie próbuj kolejnych jeśli brak kasy
    }
  }
  _checkRespawn();

  // Respawn manualny klawiszem Home
  if (input.homePressed && _respawnCooldown <= 0) {
    const safeH = terrain.getHeightAt(MAP.playerSpawn.x, MAP.playerSpawn.z);
    player.chassisBody.position.set(MAP.playerSpawn.x, safeH + 10, MAP.playerSpawn.z);
    player.chassisBody.velocity.set(0, 0, 0);
    player.chassisBody.angularVelocity.set(0, 0, 0);
    player.chassisBody.quaternion.setFromEuler(0, 0, 0);
    _respawnCooldown = 120;
    hud.showMessage('RESPAWN!', '#ffaa00', 1500);
  }

  for (const npc of npcCars) {
    if (npc.isAlive) npc.update(terrain, player.chassisBody.position);
  }

  for (const z of zombies) {
    if (z.isAlive) z.update(dt);
  }

  particles.update(dt);
  timer.update(dt);
  thirdPersonCam.update(player.group, input.throttle);

  // ── Boost FOV ──
  const targetFov = player.boostActive ? BOOST_FOV_ACTIVE : BOOST_FOV_NORMAL;
  camera.fov += (targetFov - camera.fov) * BOOST_FOV_LERP;
  camera.updateProjectionMatrix();

  const speedKmh = player.chassisBody ? player.chassisBody.velocity.length() * 3.6 : 0;
  hud.update(timer.getDisplay(), zombieKills, carKills, player.hp, credits, speedKmh, player._boostFuel, player.boostActive);
  damageOverlay.update(player.damageSystem.state);

  renderer.render(scene, camera);
}

gameLoop();
