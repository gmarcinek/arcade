import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { InputManager } from './input.js';
import { Arena } from './arena/Arena.js';
import { PlayerCar } from './entities/PlayerCar.js';
import { AICar } from './entities/AICar.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { ExplosionSystem } from './systems/ExplosionSystem.js';
import { HUD } from './ui/HUD.js';
import { SplashScreen } from './ui/SplashScreen.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { ARENA_W, ARENA_H, MAX_SPEED } from './constants.js';
import { AudioManager } from './audio/AudioManager.js';
import { PowerUpSystem } from './systems/PowerUpSystem.js';

// ── Init PixiJS ──────────────────────────────────────────────────
const app = new PIXI.Application();
await app.init({
  canvas: document.getElementById('game'),
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});

const audio = new AudioManager();

window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  if (hud) hud.resize(window.innerWidth, window.innerHeight);
});

// ── Matter.js ────────────────────────────────────────────────────
const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
const world = engine.world;

// ── World container (camera moves this) ─────────────────────────
const worldContainer = new PIXI.Container();
app.stage.addChild(worldContainer);

// ── Arena ────────────────────────────────────────────────────────
const arena = new Arena(engine, world);
worldContainer.addChild(arena.container);

// ── Input ────────────────────────────────────────────────────────
const input = new InputManager();

// ── Systems ──────────────────────────────────────────────────────
const camera = new CameraSystem();
const explosions = new ExplosionSystem(worldContainer);

// ── Game state ───────────────────────────────────────────────────
const GAME_STATES = { SPLASH: 0, PLAYING: 1, GAME_OVER: 2 };
let gameState = GAME_STATES.SPLASH;
let timeLeft = 180; // seconds
let killCount = 0;
const entities = new Map(); // matterBody.id → Car|AICar instance
let aiCars = [];
let player = null;
let hud = null;
let powerUps = null;

// ── Collision system (holds reference to entities Map) ───────────
const collisionSystem = new CollisionSystem(engine, entities, audio);

function spawnPlayer() {
  player = new PlayerCar({ x: ARENA_W / 2, y: ARENA_H / 2, engine, world, input });
  worldContainer.addChild(player.pixiContainer);
  entities.set(player.matterBody.id, player);
  player.onDie = () => {
    audio.explode();
    explosions.spawn(player.pixiContainer.x, player.pixiContainer.y);
    setTimeout(() => endGame(false), 1500);
  };
}

function spawnAI(n) {
  const positions = [
    { x: 400, y: 400 },
    { x: ARENA_W - 400, y: 400 },
    { x: 400, y: ARENA_H - 400 },
    { x: ARENA_W - 400, y: ARENA_H - 400 },
  ];
  for (let i = 0; i < n; i++) {
    const pos = positions[i % positions.length];
    const ai = new AICar({ x: pos.x, y: pos.y, engine, world });
    ai.playerRef = player;
    worldContainer.addChild(ai.pixiContainer);
    entities.set(ai.matterBody.id, ai);
    ai.onDie = () => {
      audio.explode();
      killCount++;
      explosions.spawn(ai.pixiContainer.x, ai.pixiContainer.y);
      Matter.Composite.remove(world, ai.matterBody);
      worldContainer.removeChild(ai.pixiContainer);
      entities.delete(ai.matterBody.id);
      aiCars.splice(aiCars.indexOf(ai), 1);
      if (aiCars.length === 0) endGame(true);
    };
    aiCars.push(ai);
  }
}

function initGame() {
  // Clean up previous session entities
  for (const [, ent] of entities) {
    Matter.Composite.remove(world, ent.matterBody);
    worldContainer.removeChild(ent.pixiContainer);
  }
  entities.clear();
  aiCars = [];
  timeLeft = 180;
  killCount = 0;

  if (powerUps) {
    powerUps.destroy();
    powerUps = null;
  }

  spawnPlayer();
  spawnAI(4);

  powerUps = new PowerUpSystem(worldContainer, engine, world);

  if (!hud) {
    hud = new HUD(app.stage, window.innerWidth, window.innerHeight);
  }

  audio.startEngine(0, MAX_SPEED);
}

function endGame(win) {
  if (gameState !== GAME_STATES.PLAYING) return;
  gameState = GAME_STATES.GAME_OVER;
  audio.stopEngine();
  if (win) {
    gameOver.showWin(timeLeft, killCount);
  } else {
    gameOver.showLose(timeLeft);
  }
}

// ── UI ───────────────────────────────────────────────────────────
const splash = new SplashScreen(app.stage, window.innerWidth, window.innerHeight, () => {
  audio.unlock();
  initGame();
  gameState = GAME_STATES.PLAYING;
});

const gameOver = new GameOverScreen(app.stage, window.innerWidth, window.innerHeight, () => {
  gameOver.hide();
  initGame();
  gameState = GAME_STATES.PLAYING;
});

// ── Game Loop ────────────────────────────────────────────────────
let lastTime = performance.now();

app.ticker.add((ticker) => {
  const dt = ticker.deltaTime;
  const now = performance.now();
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;

  if (gameState === GAME_STATES.SPLASH) {
    splash.update();
    return;
  }

  if (gameState !== GAME_STATES.PLAYING) return;

  // Timer
  timeLeft = Math.max(0, timeLeft - elapsed);
  if (timeLeft === 0) {
    endGame(true);
    return;
  }

  // Update player
  if (player && player.isAlive) {
    player.update(dt);
    audio.updateEngine(Math.abs(player.speed), MAX_SPEED);
  }

  // Update AI
  for (const ai of aiCars) {
    if (ai.isAlive) ai.update(dt);
  }

  // Physics
  Matter.Engine.update(engine, 1000 / 60);

  // Sync physics → pixi for all living entities
  for (const [, ent] of entities) {
    if (ent.isAlive) ent.syncFromPhysics();
  }

  // Power-ups
  if (powerUps) powerUps.update(dt, entities, audio);

  // Explosions
  explosions.update();

  // Camera
  if (player) {
    const px = player.isAlive ? player.pixiContainer.x : ARENA_W / 2;
    const py = player.isAlive ? player.pixiContainer.y : ARENA_H / 2;
    camera.update(worldContainer, px, py, app.renderer.width, app.renderer.height);
  }

  // HUD
  if (hud && player) {
    hud.update(player.hp, player.maxHp, timeLeft, aiCars.length);
  }
});
