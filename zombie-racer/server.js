/**
 * Zombie Racer — Multiplayer Relay Server
 * Express + Socket.io, gotowy na onrender.com
 *
 * Architektura: Client-authoritative
 *   - Każdy klient liczy własną fizykę
 *   - Serwer relayuje pozycje ~20/s
 *   - Serwer zlicza kills per IP i zarządza meczami (co 5 min, wyrównane do zegara)
 */

import express        from 'express';
import { createServer } from 'http';
import { Server }     from 'socket.io';
import { fileURLToPath } from 'url';
import path           from 'path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

// ── Static: serwuj zbudowaną grę ──────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
);

// ── Match state ───────────────────────────────────────────────────
const MATCH_MS      = 5 * 60 * 1000; // 5 minut
const RESULTS_MS    = 7_000;          // 7s ekranu wyników

const players    = new Map(); // socketId → pełny stan gracza
const scores     = new Map(); // ip → kills w aktualnym meczu
let   inResults  = false;     // czy trwa ekran wyników

// ── Server-authoritative broken-trees set ────────────────────────
const brokenTrees = new Set(); // Set<treeIndex>

// ── Server-authoritative zombie management ────────────────────
const ZOMBIE_COUNT    = 80;
const SRV_ZOMBIE_SPEED = 1.2;
const SRV_ZOMBIE_MAP   = 185; // half-extent planszy [m]

const serverZombies = [];

function initServerZombies() {
  serverZombies.length = 0;
  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    serverZombies.push({
      id:           i,
      x:            (Math.random() - 0.5) * SRV_ZOMBIE_MAP * 2,
      z:            (Math.random() - 0.5) * SRV_ZOMBIE_MAP * 2,
      alive:        true,
      wanderAngle:  Math.random() * Math.PI * 2,
      nextWanderAt: Date.now() + Math.random() * 3000,
    });
  }
}
initServerZombies();

let _zombieTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt  = Math.min((now - _zombieTick) / 1000, 0.2);
  _zombieTick = now;
  for (const z of serverZombies) {
    if (!z.alive) continue;
    if (now >= z.nextWanderAt) {
      z.wanderAngle  = Math.random() * Math.PI * 2;
      z.nextWanderAt = now + 2000 + Math.random() * 3000;
    }
    z.x += Math.sin(z.wanderAngle) * SRV_ZOMBIE_SPEED * dt;
    z.z += Math.cos(z.wanderAngle) * SRV_ZOMBIE_SPEED * dt;
    if (z.x >  SRV_ZOMBIE_MAP) z.x = -SRV_ZOMBIE_MAP;
    if (z.x < -SRV_ZOMBIE_MAP) z.x =  SRV_ZOMBIE_MAP;
    if (z.z >  SRV_ZOMBIE_MAP) z.z = -SRV_ZOMBIE_MAP;
    if (z.z < -SRV_ZOMBIE_MAP) z.z =  SRV_ZOMBIE_MAP;
  }
}, 100);

function timeLeft() {
  return MATCH_MS - (Date.now() % MATCH_MS);
}

/** Harmonogram wyłączony — brak automatycznego restartu meczu. */
// scheduleMatchEnd(); — wyłączone

// ── Broadcast ~20/s: gracze + zombie (serwer-autoryt.) ────────────
setInterval(() => {
  if (players.size === 0) return;
  const state = {};
  for (const [id, p] of players) {
    state[id] = {
      ip: p.ip,
      x: p.x, y: p.y, z: p.z,
      qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
      vx: p.vx, vy: p.vy, vz: p.vz,
      hp: p.hp, maxHp: p.maxHp,
      dmg: p.dmg,
      color: p.color,
      mass: p.mass,
      momentum: p.momentum,
    };
  }
  const zbState = serverZombies
    .filter(z => z.alive)
    .map(z => ({ id: z.id, x: z.x, z: z.z }));
  io.emit('ws', { players: state, zombies: zbState });
}, 50);

// ── Połączenia ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Wyciągnij IP (za reverse proxy Render.com)
  const rawIp  = socket.handshake.headers['x-forwarded-for']
              || socket.handshake.address
              || '?';
  const fullIp = String(rawIp).split(',')[0].trim();
  // Pokaż tylko ostatnie dwa oktety żeby nie ujawniać pełnego IP
  const shortIp = fullIp.includes('.')
    ? fullIp.split('.').slice(-2).join('.')
    : fullIp.slice(-8);

  players.set(socket.id, {
    ip: shortIp,
    x: 0, y: 0, z: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    vx: 0, vy: 0, vz: 0,
    hp: 100, maxHp: 100,
    dmg: {},
    color: 0x00dd66,
    mass: 1500,
    momentum: 0,
  });
  if (!scores.has(shortIp)) scores.set(shortIp, 0);

  // Wyślij stan do nowego gracza (w tym aktualny snapshot zombie)
  socket.emit('init', {
    id:       socket.id,
    ip:       shortIp,
    players:  Object.fromEntries(
      [...players.entries()].map(([id, p]) => [id, {
        ip: p.ip, x: p.x, y: p.y, z: p.z,
        qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
        hp: p.hp, maxHp: p.maxHp, dmg: p.dmg, color: p.color,
      }])
    ),
    zombies:  serverZombies.filter(z => z.alive).map(z => ({ id: z.id, x: z.x, z: z.z })),
    brokenTrees: [...brokenTrees],
    timeLeft: timeLeft(),
    scores:   Object.fromEntries(scores),
    inResults,
  });

  // Powiadom innych
  socket.broadcast.emit('playerJoined', { id: socket.id, ip: shortIp });

  // Odbierz aktualizację pozycji + pełny stan fizyki
  socket.on('pos', (d) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = d.x; p.y = d.y; p.z = d.z;
    p.qx = d.qx; p.qy = d.qy; p.qz = d.qz; p.qw = d.qw;
    p.vx = d.vx ?? 0; p.vy = d.vy ?? 0; p.vz = d.vz ?? 0;
    p.hp  = d.hp  ?? 100;
    p.maxHp = d.maxHp ?? 100;
    p.dmg   = d.dmg   ?? {};
    p.color = d.color ?? 0x00dd66;
    p.mass  = d.mass  ?? 1500;
    p.momentum = d.momentum ?? 0;
  });

  // Klient złamał drzewo — relay do wszystkich pozostałych
  socket.on('treeBreak', ({ id, dirX, dirZ, speed, launch }) => {
    if (brokenTrees.has(id)) return; // już złamane, zignoruj duplikat
    brokenTrees.add(id);
    socket.broadcast.emit('treeBreak', { id, dirX, dirZ, speed, launch });
  });

  // Klient trafił w innego gracza — przekaż impuls do celu
  socket.on('hitPlayer', ({ targetId, damage }) => {
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket && damage > 0) {
      targetSocket.emit('impact', { fromId: socket.id, damage });
    }
  });

  // Klient eksplodował (koniec czasu) — relay do pozostałych
  socket.on('playerExploded', ({ x, y, z }) => {
    socket.broadcast.emit('playerExploded', { id: socket.id, x, y, z });
  });

  // Ping latency measurement
  socket.on('ping_mp', (t) => socket.emit('pong_mp', t));

  // Odbierz kill event (NPC lub zombie)
  socket.on('kill', () => {
    if (inResults) return;
    const p = players.get(socket.id);
    if (!p) return;
    const cur = scores.get(p.ip) || 0;
    scores.set(p.ip, cur + 1);
    io.emit('scoreUpdate', { ip: p.ip, kills: scores.get(p.ip) });
  });

  // Klient zabił konkretnego zombiaka (autoryt. serwer: usuń go ze stanu)
  socket.on('zombieKill', (id) => {
    const z = serverZombies[id];
    if (!z || !z.alive) return;
    z.alive = false;
    setTimeout(() => {
      if (!inResults) {
        z.alive = true;
        z.x = (Math.random() - 0.5) * SRV_ZOMBIE_MAP * 2;
        z.z = (Math.random() - 0.5) * SRV_ZOMBIE_MAP * 2;
      }
    }, 8000);
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    const wasAlive = p && (p.hp ?? 100) > 0;
    players.delete(socket.id);
    if (wasAlive) {
      // Wysyłać playerExploded zamiast playerLeft — reload = eksplozja dla innych
      socket.broadcast.emit('playerExploded', {
        id: socket.id,
        x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0,
      });
    } else {
      socket.broadcast.emit('playerLeft', { id: socket.id });
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Zombie Racer server on :${PORT}`);
});
