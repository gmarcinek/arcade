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
import { CAMERA_OFFSET_BEHIND, HP_TO_CREDIT, HP_TO_TIME } from './physicsConfig.js';
import { AudioManager }      from './audio/AudioManager.js';
import { MultiplayerClient } from './multiplayer/MultiplayerClient.js';
import { RemotePlayers }     from './multiplayer/RemotePlayers.js';

// ── Map ────────────────────────────────────────────────────
let MAP = defaultMap;

// ── Multiplayer ─────────────────────────────────────────
/** @type {MultiplayerClient|null} */
let mpClient       = null;
/** @type {RemotePlayers|null} */
let remotePlayers  = null;
let _mpScores      = new Map();  // ip → kills (lokalny podręczny cache)
let _mpMatchEl     = null;       // DOM overlay wyników meczu
let _mpScoreEl     = null;       // DOM tablica wyników na żywo
let _mpInitPlayers = null;       // gracze z serwera przy wejściu (dodawani po initWorld)
let _mpInitZombies     = null;       // zombie z serwera przy wejściu
let _mpInitBrokenTrees = null;       // drzewa złamane przed dołączeniem
let _mpZombies         = null;       // Map<serverId, Zombie> — zombie zarządzane przez serwer
const MATCH_MS     = 5 * 60 * 1000;
/** Map<remoteId, timestamp> — timestamp mojego ostatniego trafienia tego gracza (last-hitter tracking) */
const _remoteLastHitMs = new Map();

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

// ── Game objects — lazy-init in initWorld() after map selection ───
let city, player, npcCars = [], zombies = [], collisions;

// ── Input ─────────────────────────────────────────────────────────
// pointer: coarse = palec/rysik (prawdziwy dotyk); fine = myszka/touchpad
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const input = isTouchDevice ? new TouchInput() : new KeyboardInput();

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
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Przechyl</kbd></td><td style="color:#aaa;">Skręt</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Prawa góra</kbd></td><td style="color:#aaa;">THROTTLE</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Prawa dół</kbd></td><td style="color:#aaa;">BACK</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">Lewa</kbd></td><td style="color:#aaa;">BRAKE</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">NA KOŁA</kbd></td><td style="color:#aaa;">Respawn lokalny</td></tr>
        <tr><td style="text-align:right;padding:6px 14px 6px 0;"><kbd style="${KBD}">START</kbd></td><td style="color:#aaa;">Powrót na start</td></tr>
      </table>
      <div style="margin-top:28px;font-size:14px;color:#777;letter-spacing:1px;">GRAJ W POZIOMIE I DOTKNIJ EKRANU</div>
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



const CREDITS_ZOMBIE    = 200;   // za rozjechanie zombie
const CREDITS_CAR_KILL  = 2000;  // za zniszczenie NPC/remote auta
const CREDITS_HEAL_COST =  50;   // koszt leczenia
const HEAL_AMOUNT       =  30;   // ile HP odzyskujemy
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
  zombie.kill(scene, world);
  timer.addTime(20);
  zombieKills++;
  mpClient?.sendKill();
  // W MP: poinformuj serwer kt贸ry zombie zosta艂 zabity i usu艅 z mapy lokalnej
  if (zombie._mpId !== undefined) {
    mpClient?.sendZombieKill(zombie._mpId);
    _mpZombies?.delete(zombie._mpId);
    const idx = zombies.indexOf(zombie);
    if (idx !== -1) zombies.splice(idx, 1);
  }
  addCredits(CREDITS_ZOMBIE, '🧟 +20s', '#44ff44');
  const pos = zombie.mesh ? zombie.mesh.position : { x: 0, z: 0 };
  particles.spawnBloodSplatter(pos.x, 1, pos.z);
  audio.playZombieHit();
  checkWinConditions();
}

function showWin(reason) {
  if (gameOverVisible) return;
  gameOverVisible = true;
  audio.playWin();
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
  if (npcCars.length > 0) {
    const aliveNpcs = npcCars.filter(c => c.isAlive).length;
    if (aliveNpcs === 0) { showWin('Wszystkich oponentów zniszczono! 🚗💥'); return; }
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
  const BLAST_FORCE      = 2800; // [N·s] impulse
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
      player.hp = Math.max(0, player.hp - Math.round(BLAST_DMG_PLAYER * falloff));
      hud.showMessage('💥 Fala uderzeniowa!', '#ff4444', 1000);
    } else if (t.npcRef) {
      t.npcRef.hp = Math.max(0, t.npcRef.hp - Math.round(BLAST_DMG_NPC * falloff));
      if (t.npcRef.hp <= 0 && t.npcRef.isAlive) onCarKill(t.npcRef);
    }

    // Impuls fizyczny
    const strength = BLAST_FORCE * falloff;
    const len = dist || 0.01;
    const nx = dx / len;
    const nz = dz / len;
    // Impuls w środku masy = 100% liniowy, 0% moment obrotowy
    body.applyImpulse(
      new CANNON.Vec3(
        nx * strength * (1 - BLAST_UP_BIAS),
        strength * BLAST_UP_BIAS,
        nz * strength * (1 - BLAST_UP_BIAS)
      ),
      new CANNON.Vec3(body.position.x, body.position.y, body.position.z)
    );
    // 1/9 obrotu do 9/9 kierunku
    body.angularVelocity.x += (Math.random() - 0.5) * (strength / 36000);
    body.angularVelocity.z += (Math.random() - 0.5) * (strength / 36000);
  }

  // Po wybuchu: popatrz o 1s dłużej przed powrotem do gracza.
  setTimeout(() => camCtrl.setState(CamState.PLAYER), 2500);

  timer.addTime(60);
  carKills++;
  mpClient?.sendKill();
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
  npc.isAlive  = false;
  npc._isDying = true;
  npc._dyingTimer     = 0;
  npc._dyingExplodeAt = 2.0 + Math.random() * 1.0; // 2-3s losowo
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

function onCarHit(damageDealt, npcMaxHp = 600) {
  const earnedCr  = Math.max(1, Math.round(damageDealt * HP_TO_CREDIT));
  const earnedSec = Math.round(damageDealt * HP_TO_TIME);
  if (earnedSec > 0) timer.addTime(earnedSec);
  const timeLabel = earnedSec > 0 ? ` +${earnedSec}s` : '';
  addCredits(earnedCr, `💥 hit${timeLabel}`, '#ffaa44');
  audio.playOpponentHitStrong(Math.min(1.0, damageDealt / 20));
}

// ── Collision handler — created in initWorld() ───────────────────

// ── Game Over ─────────────────────────────────────────────────────
let gameOverVisible   = false;
let _gameOverSequence = false; // true = czas się skończył, scena renderuje, gracz nie steruje

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

  // Poinformuj innych graczy przez serwer
  mpClient?.sendPlayerExploded(ep.x, ep.y, ep.z);

  audio.playGameOver();
}

timer.onGameOver = () => {
  if (_gameOverSequence || gameOverVisible) return;
  _gameOverSequence = true;

  _triggerGameOverExplosion();

  // Plansza pojawia się po 5s — scena renderuje się normalnie przez cały czas
  setTimeout(() => {
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
  }, 5000);
};

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  _playerDead      = true;
  _playerDeathTimer = PLAYER_RESPAWN_DELAY;

  const ep = player.chassisBody.position;

  // Eksplozja jak NPC
  particles.spawnExplosion(ep.x, ep.y + 1, ep.z);
  particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.5, ep.y + 2.5, ep.z + (Math.random() - 0.5) * 1.5);
  particles.spawnExplosion(ep.x + (Math.random() - 0.5) * 1.0, ep.y + 0.5, ep.z + (Math.random() - 0.5) * 1.0);
  audio.playCarExplosion();

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
    <button id="_btnMulti" style="${btnStyle}background:#cc3300;color:#fff;">
      🌐 MULTIPLAYER
    </button>
    <div id="_mpStatus" style="margin-top:20px;color:#888;font-size:13px;height:20px;"></div>
  `;
  document.body.appendChild(overlay);

  const status = overlay.querySelector('#_mpStatus');

  overlay.querySelector('#_btnSingle').onclick = () => {
    document.body.removeChild(overlay);
    showMapMenu();
  };

  overlay.querySelector('#_btnMulti').onclick = () => {
    overlay.querySelector('#_btnMulti').disabled = true;
    status.textContent = 'Łączenie z serwerem…';
    status.style.color = '#ffcc00';

    mpClient = new MultiplayerClient();
    _setupMultiplayer(mpClient);

    mpClient.connect();

    mpClient.onInit = (data) => {
      status.textContent = `✓ Połączono jako ${data.ip}`;
      status.style.color = '#00ff88';
      // Wczytaj dotychczasowe wyniki
      _mpScores = new Map(Object.entries(data.scores || {}).map(([k, v]) => [k, Number(v)]));
      _updateScoreBoard();

      // Zapamiętaj graczy — dodamy ich po initWorld() gdy remotePlayers będzie gotowy
      _mpInitPlayers     = data.players || {};
      _mpInitZombies     = data.zombies  || [];
      _mpInitBrokenTrees = data.brokenTrees || [];

      // Jeśli akurat trwa ekran wyników — poczekaj
      if (data.inResults) {
        status.textContent = 'Czekaj na start kolejnego meczu…';
        return;
      }
      setTimeout(() => {
        document.body.removeChild(overlay);
        // W MP zawsze domyślna plansza
        MAP = defaultMap;
        startGame();
      }, 800);
    };

    // Timeout połączenia
    setTimeout(() => {
      if (!mpClient?.myId) {
        status.textContent = '✗ Brak połączenia z serwerem.';
        status.style.color = '#ff4444';
        overlay.querySelector('#_btnMulti').disabled = false;
      }
    }, 6000);
  };
}

// ── Multiplayer: inicjalizuj eventy klienta ───────────────────────

/**
 * Sync zombie z serwera. Tworzy nowe Zombie z KINEMATIC body lub aktualizuje
 * pozycję istniejących. Usuwa te, których serwer już nie zwraca (zabite).
 * @param {Array<{id:number, x:number, z:number}>} zbList
 */
function _updateMpZombies(zbList) {
  if (!_mpZombies || !terrain) return;
  const receivedIds = new Set();
  for (const zd of zbList) {
    receivedIds.add(zd.id);
    if (_mpZombies.has(zd.id)) {
      const zobj = _mpZombies.get(zd.id);
      if (!zobj.isAlive) continue;
      const y = terrain.getHeightAt(zd.x, zd.z) + 0.5;
      zobj.body.position.set(zd.x, y, zd.z);
      zobj.body.velocity.set(0, 0, 0);   // zablokuj integrację fizyki
      if (zobj.mesh) zobj.mesh.position.set(zd.x, y, zd.z);
    } else {
      const zobj = new Zombie();
      const y = terrain.getHeightAt(zd.x, zd.z) + 0.5;
      zobj.spawn(scene, world, zd.x, y, zd.z);
      // collisionResponse=false już ustawione w spawn()
      zobj._mpId = zd.id;
      _mpZombies.set(zd.id, zobj);
      zombies.push(zobj);
    }
  }
  // Usuń zombie, których serwer nie zawiera w pakiecie (zostały zabite przez innego gracza)
  for (const [id, zobj] of _mpZombies) {
    if (!receivedIds.has(id) && zobj.isAlive) {
      zobj.kill(scene, world);
      const idx = zombies.indexOf(zobj);
      if (idx !== -1) zombies.splice(idx, 1);
      _mpZombies.delete(id);
    }
  }
}

function _setupMultiplayer(client) {
  client.onPlayerJoined = (id, ip, initData) => {
    if (!remotePlayers) return;
    remotePlayers.add(id, ip, initData || {});
    hud.showMessage(`${ip} dołączył`, '#88ccff', 1500);
  };

  // Gracze którzy już eksplodowali — żeby nie płomienby się 2 razy przy rozlączeniu
  const _explodedRemote = new Set();

  client.onPlayerLeft = (id) => {
    if (!remotePlayers) return;
    if (_explodedRemote.has(id)) {
      // Już wybuchł — tylko usuń, bez ponownej animacji
      _explodedRemote.delete(id);
      remotePlayers.remove(id);
    } else {
      remotePlayers.removeWithDeath(id);
    }
  };

  client.onPlayersUpdate = (players, zombies, myId) => {
    remotePlayers?.updateState(players, myId);
    if (Array.isArray(zombies)) _updateMpZombies(zombies);
  };

  client.onScoreUpdate = (ip, kills) => {
    _mpScores.set(ip, kills);
    _updateScoreBoard();
  };

  client.onMatchEnd = (leaderboard) => {
    _showMatchOverlay(leaderboard);
  };

  client.onMatchStart = () => {
    _mpMatchEl?.remove();
    _mpMatchEl = null;
    _mpScores.clear();
    _updateScoreBoard();
    hud.showMessage('Nowy mecz! 🏁', '#ffcc00', 2000);
  };

  client.onTreeBreak = (id, dirX, dirZ, speed, launch) => {
    city?.applyRemoteTreeBreak(id, dirX, dirZ, speed, launch);
  };

  client.onImpact = ({ damage }) => {
    if (player) {
      // Taka sama ścieżka jak lokalny gracz — receiveImpact przelicza impulse → HP przez damageSystem
      player.receiveImpact(damage, { x: 1, y: 0, z: 0 });
    }
  };

  // Inny gracz eksplodował (koniec jego czasu) — pokaż eksplozję z debrisem
  client.onPlayerExploded = ({ id, x, y, z }) => {
    if (!remotePlayers) return;
    _explodedRemote.add(id); // zapamiętaj — nie rzuć wybuchu drugi raz przy disconnect
    const entry = remotePlayers._entries.get(id);
    const ip = entry?.ip ?? id;
    remotePlayers.onPlayerDied?.(id, ip, { x, y, z, clone: () => ({ x, y, z }) });
  };
}

/** Aktualizuje tabletkę wyników (prawy dolny róg) podczas meczu. */
function _updateScoreBoard() {
  if (!_mpScoreEl) return;
  const MATCH_LEFT = MATCH_MS - (Date.now() % MATCH_MS);
  const mins = Math.floor(MATCH_LEFT / 60000);
  const secs = String(Math.floor((MATCH_LEFT % 60000) / 1000)).padStart(2, '0');
  const myIp  = mpClient?.myIp;
  const ping  = mpClient?.latency ?? 0;
  const pingColor = ping < 80 ? '#44ff44' : ping < 200 ? '#ffcc00' : '#ff4444';

  // Kolekcja wszystkich graczy z HP
  const allPlayers = [];
  // Ja
  if (player && myIp) {
    allPlayers.push({ ip: myIp, kills: _mpScores.get(myIp) ?? 0, hp: player.hp, maxHp: player.maxHp, me: true });
  }
  // Zdalni
  if (remotePlayers) {
    for (const [, e] of remotePlayers._entries) {
      const kills = _mpScores.get(e.ip) ?? 0;
      allPlayers.push({ ip: e.ip, kills, hp: e.hp, maxHp: e.maxHp, me: false });
    }
  }
  allPlayers.sort((a, b) => b.kills - a.kills);

  const rows = allPlayers.slice(0, 8).map(p => {
    const meStyle  = p.me ? 'color:#ffcc00;font-weight:900;' : 'color:#ccc;';
    const hpPct    = Math.max(0, Math.min(100, Math.round(p.hp / p.maxHp * 100)));
    const hpColor  = hpPct > 60 ? '#44cc44' : hpPct > 25 ? '#ccaa00' : '#cc3300';
    const hpBar    = `<span style="display:inline-block;width:${hpPct * 0.6}px;height:6px;background:${hpColor};border-radius:3px;vertical-align:middle;"></span>`;
    return `<div style="${meStyle}display:flex;gap:6px;align-items:center;">
      <span style="flex:1;font-family:monospace;font-size:12px;">${p.ip}</span>
      <span style="font-size:11px;color:#aaa;">${p.kills}k</span>
      ${hpBar}
    </div>`;
  }).join('');

  _mpScoreEl.innerHTML = `
    <div style="color:#888;font-size:11px;margin-bottom:6px;display:flex;justify-content:space-between;">
      <span>🕐 ${mins}:${secs}</span>
      <span style="color:${pingColor};">ping ${ping}ms</span>
    </div>
    <div>${rows || '<div style="color:#555">brak graczy</div>'}</div>
  `;
}

/** Pokazuje fullscreen leaderboard po zakończeniu meczu (7s). */
function _showMatchOverlay(leaderboard) {
  _mpMatchEl?.remove();
  const myIp = mpClient?.myIp;

  const rows = leaderboard.map((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const me    = e.ip === myIp ? ';font-size:22px;color:#ffcc00' : '';
    return `<div style="margin:4px 0${me}">${medal} ${e.ip} — ${e.kills} kills</div>`;
  }).join('');

  _mpMatchEl = document.createElement('div');
  _mpMatchEl.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.88);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    z-index:500;color:#fff;font-family:system-ui,sans-serif;
  `;
  _mpMatchEl.innerHTML = `
    <div style="font-size:42px;font-weight:900;color:#ffcc00;letter-spacing:3px;margin-bottom:8px;">
      KONIEC MECZU
    </div>
    <div style="font-size:14px;color:#888;margin-bottom:28px;">
      Kolejny mecz za 7 sekund…
    </div>
    <div style="font-size:18px;line-height:2;text-align:center;">
      ${rows || '<div style="color:#555">brak wyników</div>'}
    </div>
  `;
  document.body.appendChild(_mpMatchEl);
}

// ── Map Menu ──────────────────────────────────────────────────────
function showMapMenu() {
  const maps = JSON.parse(localStorage.getItem('zombieRacerMaps') || '{}');
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

function initWorld(mapData) {
  const playerSpawn  = mapData.playerSpawn  ?? { x: 0, z: 0 };
  const npcWaypoints = mapData.npcWaypoints ?? [];
  const zombieSpawns = mapData.zombieSpawns ?? [];

  city = new CityBuilder();
  city.build(scene, world, terrain, mapData);

  player = new PlayerCar();
  const spawnH = terrain.getHeightAt(playerSpawn.x, playerSpawn.z);
  player.build(scene, world, playerSpawn.x, spawnH + 0.9, playerSpawn.z, 0x00dd66);
  // group 2 = kolizje z remote players (group 8, mask 2)
  player.chassisBody.collisionFilterGroup = 2;

  const npcColors = [0xcc2200, 0x2200cc, 0xcc8800, 0xaa00cc, 0x00aacc, 0xddcc00, 0x00cc44, 0xff6600, 0x8800cc, 0xcc0066];
  npcCars = [];
  // W trybie multiplayer nie ma NPC cars — tylko gracze ludzcy
  if (!mpClient) {
    for (let i = 0; i < Math.min(npcWaypoints.length, 10); i++) {
      const npc = new NPCCar(npcWaypoints[i], npcColors[i % npcColors.length]);
      npc.buildNPC(scene, world, terrain);
      npc.onSmoke       = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);
      npc.onFireExplode = () => onCarKill(npc);
      npc.onDestroy     = () => onCarKill(npc);
      npc.onBoundsExit  = () => setTimeout(() => _respawnNPC(npc), 500);
      npcCars.push(npc);
    }
  }

  zombies = [];
  // W trybie SP: spawn lokalnych zombie; w MP: serwer jest autorytatywny
  if (!mpClient) {
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
  } else {
    _mpZombies = new Map();
  }

  // MP: utwórz RemotePlayers PRZED CollisionHandler, żeby remoteBodyMap był prawidłowy
  if (mpClient) {
    remotePlayers = new RemotePlayers(scene, world, terrain);
    // Dym uszkodzenia zdalnych aut — taki sam system jak u gracza lokalnego
    remotePlayers.onSmoke = (x, y, z, type) => particles.spawnSmoke(x, y, z, type);

    // Dodaj graczy którzy byli już na serwerze w momencie wejścia
    if (_mpInitPlayers) {
      for (const [id, p] of Object.entries(_mpInitPlayers)) {
        if (id !== mpClient.myId) remotePlayers.add(id, p.ip, p);
      }
      _mpInitPlayers = null;
    }
  }

  collisions = new CollisionHandler(world, player, zombies, npcCars, timer, hud, audio, city, onZombieKill, onCarKill, onCarHit, {
    remoteBodyMap: remotePlayers ? { get: (b) => remotePlayers.getBodyMap().get(b) } : null,
    onTreeBreak: (treeIndex, impactDir, impactSpeed, launchSpeed) => {
      mpClient?.sendTreeBreak(treeIndex, impactDir.x, impactDir.z, impactSpeed, launchSpeed);
    },
    onRemoteHit: (remoteId, damage, won) => {
      mpClient?.sendHitPlayer(remoteId, damage);
      if (won) _remoteLastHitMs.set(remoteId, Date.now()); // nagroda tylko dla zwycięzcy
    },
  });
  _lastValidPos = { x: playerSpawn.x, z: playerSpawn.z };

  if (mpClient) {

    // Last-hitter tracking: kto ostatni zadał nieautomatyczny damage zdalnemu graczowi
    // Wpis 'me' ustawiany gdy lokalny gracz trafia; kasowany gdy inny gracz trafia jako nowszy
    remotePlayers.onHpDrop = (id, prevHp, newHp) => {
      const drop = prevHp - newHp;
      const myHitAge = Date.now() - (_remoteLastHitMs.get(id) ?? 0);
      if (myHitAge <= 1500 && drop > 0) {
        // Mój damage dotarł do serwera i wrócił jako HP drop — nagradzaj
        const e = remotePlayers._entries.get(id);
        onCarHit(drop, e?.maxHp ?? 100);
      } else if (drop > 3 && myHitAge > 1500) {
        // Znaczny spadek spoza mojego okna → ktoś inny trafił → kasuj kill credit
        _remoteLastHitMs.delete(id);
      }
    };

    // Callback: zdalny gracz zginął — pełna sekwencja eksplozji jak NPC
    remotePlayers.onPlayerDied = (id, ip, pos) => {
      const x = pos.x, y = pos.y, z = pos.z;

      // Pierwsza eksplozja — natychmiastowa
      particles.spawnExplosion(x, y + 1, z);
      audio.playCarExplosion();

      // Druhie jądro + dym 250ms później
      setTimeout(() => {
        particles.spawnExplosion(x + (Math.random() - 0.5) * 1.5, y + 2.5, z + (Math.random() - 0.5) * 1.5);
        particles.spawnExplosion(x + (Math.random() - 0.5) * 1.0, y + 0.5, z + (Math.random() - 0.5) * 1.0);
        audio.playCarExplosion();
      }, 250);

      // Gruz fizyczny z dymem (tak samo jak NPC)
      debris.spawn(
        x, y + 0.5, z,
        0, 0, 0,
        (dx, dy, dz, type) => particles.spawnSmoke(dx, dy, dz, type)
      );

      // Kill credit — jeśli ja zadałem ostatni nieautomatyczny damage
      if (_remoteLastHitMs.has(id)) {
        _remoteLastHitMs.delete(id);
        timer.addTime(60);
        addCredits(CREDITS_CAR_KILL, `💀 ${ip} +1:00`, '#ffcc00');
      }

      hud.showMessage(`💥 ZABITY: ${ip}`, '#ff4400', 2500);
    };

    // Zastosuj początkowy snapshot zombie z serwera
    if (_mpInitZombies) {
      _updateMpZombies(_mpInitZombies);
      _mpInitZombies = null;
    }

    // Odtwrz drzewa złamane przed dołączeniem
    if (_mpInitBrokenTrees) {
      for (const id of _mpInitBrokenTrees) city?.applyRemoteTreeBreak(id);
      _mpInitBrokenTrees = null;
    }

    // Tablica wyników (prawy dolny róg)
    _mpScoreEl = document.createElement('div');
    _mpScoreEl.style.cssText = `
      position:fixed;bottom:16px;right:16px;
      background:rgba(0,0,0,0.65);border:1px solid #333;
      border-radius:8px;padding:8px 12px;z-index:100;
      color:#ccc;min-width:180px;pointer-events:none;
    `;
    document.body.appendChild(_mpScoreEl);
    _updateScoreBoard();
    // Aktualizuj licznik co sekundę
    setInterval(() => { if (_mpScoreEl) _updateScoreBoard(); }, 1000);
  }
}

function startGame() {
  initWorld(MAP);
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
  accumulator += dt;

  // Podczas sekwencji game over: gracz nie steruje, ale scena się renderuje
  if (!_gameOverSequence) {
    player.update(input, dt);
  }

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

  // ── Multiplayer: wyślij pełny stan gracza + zombie ──────────────
  if (!_gameOverSequence && mpClient?.connected && player.chassisBody) {
    const pos = player.chassisBody.position;
    const q   = player.chassisBody.quaternion;
    const vel = player.chassisBody.velocity;
    const mass     = player.chassisBody.mass;
    const momentum = vel.length() * mass;
    mpClient.sendPosition(
      pos.x, pos.y, pos.z,
      q.x, q.y, q.z, q.w,
      vel.x, vel.y, vel.z,
      player.hp, player.maxHp,
      { ...player.damageSystem.state },
      0x00dd66, mass, momentum
    );
  }
  if (remotePlayers) remotePlayers.update(dt);

  if (!_gameOverSequence) {
    // ── Healing — każde wciśnięcie Backspace = 1 leczenie instant ──
    while (input.consumeHeal()) {
      if (credits >= CREDITS_HEAL_COST) {
        credits -= CREDITS_HEAL_COST;
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
    if (!_playerDead && player.hp > 0 && player.hp < player.maxHp * 0.20) {
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
  } // end !_gameOverSequence

  for (const npc of npcCars) {
    if (npc.isAlive) {
      npc.update(terrain, player.chassisBody.position, player.chassisBody.velocity, npcCars);
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

  for (const z of zombies) {
    if (z.isAlive && z._mpId === undefined) z.update(dt); // MP zombie: pozycja z serwera
  }

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
  audio.updateEngine(speedKmh, input.throttle, player._boostLevel, engineDmgPct, player.hp / player.maxHp);
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
  minimap?.update(player.chassisBody.position, playerYaw, npcCars);

  renderer.render(scene, camera);
}

showModeMenu();
