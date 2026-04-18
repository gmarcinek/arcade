// ═══════════════════════════════════════════════
//  Block Dock – game.js
// ═══════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const DPR    = Math.min(window.devicePixelRatio || 1, 2);
let W, H;

// ── Config ──────────────────────────────────────
let GRID  = 9;   // active grid size
const BLOCK = 3; // sub-block side (clearing unit)
const GRID_SIZES = [6, 9, 12];

// Fixed cell size in CSS pixels — board size = GRID × CELL_PX
const CELL_PX = 36;
// Fixed tray piece cell size — same regardless of board size
const TRAY_CELL_PX = 22;

// ── Shapes ──────────────────────────────────────
// ALL_SHAPES is defined in shapes.js (loaded before this file).
// Canonical shapes are listed there and all rotations/mirrors
// are auto-generated at startup.
//
// Dummy guard — should never trigger if scripts are loaded correctly:
if (typeof ALL_SHAPES === 'undefined') throw new Error('shapes.js must be loaded before game.js');



// ── Color settings ──────────────────────────────
// Three independent colors stored in localStorage.
const DEFAULTS = { bg: '#ffffff', block: '#224baa', grid: '#383838' };

function getBgColor()    { return localStorage.getItem('BD_BG')    || DEFAULTS.bg;    }
function getBlockColor() { return localStorage.getItem('BD_BLOCK') || DEFAULTS.block; }
function getGridColor()  { return localStorage.getItem('BD_GRID')  || DEFAULTS.grid;  }
function getGridAlpha()  { return parseFloat(localStorage.getItem('BD_GRID_ALPHA') || '0.34'); }

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function themeRgba(hex, a) {
  const [r,g,b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function colorDarken(hex, amount) {
  const [r,g,b] = hexToRgb(hex);
  return `rgb(${Math.max(0,r-amount)},${Math.max(0,g-amount)},${Math.max(0,b-amount)})`;
}

// Returns perceived luminance 0..1 (sRGB approximation)
function luminance(hex) {
  const [r,g,b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

function applyAccent() {
  const block = getBlockColor();
  const bg    = getBgColor();
  const light = luminance(bg) > 0.35;
  const s = document.documentElement.style;
  s.setProperty('--bd-accent', block);
  s.setProperty('--bd-glow',   themeRgba(block, 0.35));
  s.setProperty('--bd-bg',     bg);
  s.setProperty('--bd-text',   light ? '#111827' : '#e2e8f0');
  s.setProperty('--bd-sub',    light ? '#6b7280' : '#4e6080');
  s.setProperty('--bd-card',   light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)');
  s.setProperty('--bd-overlay',light ? 'rgba(240,240,240,0.97)' : 'rgba(14,26,46,0.97)');
  document.body.style.background = bg;
}

// ── State ───────────────────────────────────────
let grid, tray, score, best, gameState, drag, clearingCells;

// ── Layout ──────────────────────────────────────
let boardX, boardY, cell, boardSize, trayY, trayH, trayOrigins;

function resize() {
  W = canvas.width  = Math.floor(window.innerWidth  * DPR);
  H = canvas.height = Math.floor(window.innerHeight * DPR);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  layout();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));

function layout() {
  const hudH      = 72 * DPR;
  const trayPad   = 24 * DPR;
  const traySlotH = 80 * DPR;  // reserved height for tray pieces
  const bottomPad = 16 * DPR;

  // Fixed cell size — board grows/shrinks with grid count
  cell      = CELL_PX * DPR;
  boardSize = cell * GRID;

  // Total content height: board + gap + tray
  const contentH = boardSize + trayPad + traySlotH;

  // Vertically center the content in the space below the HUD
  const usableH = H - hudH - bottomPad;
  boardY = hudH + Math.max(0, Math.round((usableH - contentH) / 2));
  boardX = Math.round((W - boardSize) / 2);

  // Tray sits just below the board
  trayY = boardY + boardSize + trayPad;
  trayH = traySlotH;

  // Tray slots span exactly the board width
  const slotW = boardSize / 3;
  const trayCellSize = TRAY_CELL_PX * DPR;
  trayOrigins = [];
  for (let i = 0; i < 3; i++) {
    trayOrigins.push({
      x: boardX + slotW * i + slotW / 2,
      y: trayY + trayH / 2,
      cellSize: trayCellSize,
    });
  }
}

// ── Persistence ─────────────────────────────────
function bestKey() { return `BD_BEST_${GRID}`; }
function loadBest() {
  try { best = parseInt(localStorage.getItem(bestKey()) || '0', 10) || 0; }
  catch { best = 0; }
}
function saveBest() {
  try { localStorage.setItem(bestKey(), String(best)); } catch { }
}

// Game-state persistence
function hasSave() {
  return !!localStorage.getItem('BD_SAVE');
}
function saveState() {
  try {
    localStorage.setItem('BD_SAVE', JSON.stringify({ GRID, score, grid, tray }));
  } catch { }
}
function clearSave() {
  localStorage.removeItem('BD_SAVE');
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('BD_SAVE'));
    if (!s) return false;
    GRID  = s.GRID;
    score = s.score;
    grid  = s.grid;
    tray  = s.tray;
    return true;
  } catch { return false; }
}

// ── Pieces ──────────────────────────────────────
function pieceBBox(shape) {
  let minX=99, minY=99, maxX=-99, maxY=-99;
  for (const [x,y] of shape) {
    if (x < minX) minX = x;  if (y < minY) minY = y;
    if (x > maxX) maxX = x;  if (y > maxY) maxY = y;
  }
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function randShape() {
  const pool = ALL_SHAPES.filter(s => s.g <= GRID);
  const entry = pool[Math.floor(Math.random() * pool.length)];
  return { shape: entry.c, color: getBlockColor() };
}

function newTray() {
  tray = [randShape(), randShape(), randShape()];
}

// ── Game flow ────────────────────────────────────
function startGame(gridSize) {
  GRID  = gridSize || GRID;
  clearSave();
  loadBest();
  applyAccent();
  grid          = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  score         = 0;
  clearingCells = [];
  drag          = null;
  newTray();
  gameState = 'playing';
  resize();
  document.getElementById('overlay').classList.add('hidden');
  updateHud();
}

function continueGame() {
  if (!loadState()) { showMenu(); return; }
  clearingCells = [];
  drag          = null;
  loadBest();
  applyAccent();
  gameState = 'playing';
  resize();
  document.getElementById('overlay').classList.add('hidden');
  updateHud();
}

function updateHud() {
  document.getElementById('score').textContent    = score;
  document.getElementById('best').textContent     = best;
  document.getElementById('gridInfo').textContent = `${GRID}×${GRID}`;
  document.getElementById('settingsBtn').style.display = 'flex';
}

// ── Menu ─────────────────────────────────────────
function showMenu() {
  gameState = 'menu';
  applyAccent();
  document.getElementById('settingsBtn').style.display = 'none';
  const ov = document.getElementById('overlay');
  const hasSaved = hasSave();

  ov.innerHTML = `
    <h1>BLOCK DOCK</h1>
    <div class="sub">Przeciągnij klocki na planszę.<br>Wypełnij rząd, kolumnę lub kwadrat 3×3.</div>

    ${hasSaved ? `<button id="continueBtn" style="margin-bottom:12px">KONTYNUUJ</button>` : ''}

    <div class="size-label" style="margin-top:${hasSaved ? 16 : 0}px">Nowa gra</div>
    <div class="size-picker" id="sizePicker">
      ${GRID_SIZES.map(n =>
        `<button class="size-btn${n === GRID ? ' active' : ''}" data-size="${n}">${n}×${n}</button>`
      ).join('')}
    </div>

    <button id="startBtn" style="margin-top:16px" class="secondary">START</button>
  `;
  ov.classList.remove('hidden');

  let chosenSize = GRID;

  if (hasSaved) {
    document.getElementById('continueBtn').addEventListener('click', continueGame);
  }

  ov.querySelectorAll('.size-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      chosenSize = parseInt(btn.dataset.size, 10);
      ov.querySelectorAll('.size-btn[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('startBtn').addEventListener('click', () => startGame(chosenSize));
}

function showGameOver() {
  gameState = 'dead';
  clearSave();
  document.getElementById('settingsBtn').style.display = 'none';
  if (score > best) { best = score; saveBest(); }
  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <h1 style="color:var(--bd-accent)">GAME OVER</h1>
    <div class="big">${score}</div>
    <div class="row">
      <div class="stat"><div class="l">SCORE</div><div class="v">${score}</div></div>
      <div class="stat"><div class="l">BEST</div><div class="v">${best}</div></div>
    </div>
    <button id="restartBtn">JESZCZE RAZ</button>
    <button class="secondary" id="menuBtn" style="margin-top:12px">MENU</button>
  `;
  ov.classList.remove('hidden');
  document.getElementById('restartBtn').addEventListener('click', () => startGame(GRID));
  document.getElementById('menuBtn').addEventListener('click', showMenu);
}

// ── Logic ────────────────────────────────────────
function canPlace(shape, col, row) {
  for (const [dx, dy] of shape) {
    const x = col + dx, y = row + dy;
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return false;
    if (grid[y][x] !== null) return false;
  }
  return true;
}

function place(shape, color, col, row) {
  for (const [dx, dy] of shape) grid[row + dy][col + dx] = { color };
}

function checkClears() {
  const bpr = GRID / BLOCK;  // blocks per row/col
  const rows = new Set(), cols = new Set(), blocks = new Set();

  for (let y = 0; y < GRID; y++)
    if (grid[y].every(c => c !== null)) rows.add(y);

  for (let x = 0; x < GRID; x++) {
    let full = true;
    for (let y = 0; y < GRID; y++) if (grid[y][x] === null) { full = false; break; }
    if (full) cols.add(x);
  }

  for (let by = 0; by < bpr; by++) {
    for (let bx = 0; bx < bpr; bx++) {
      let full = true;
      outer: for (let y = by*BLOCK; y < by*BLOCK+BLOCK; y++) {
        for (let x = bx*BLOCK; x < bx*BLOCK+BLOCK; x++) {
          if (grid[y][x] === null) { full = false; break outer; }
        }
      }
      if (full) blocks.add(bx + by * bpr);
    }
  }

  const toClear = new Set();
  for (const y of rows)  for (let x = 0; x < GRID; x++) toClear.add(x + y * GRID);
  for (const x of cols)  for (let y = 0; y < GRID; y++) toClear.add(x + y * GRID);
  for (const b of blocks) {
    const bx = b % bpr, by = Math.floor(b / bpr);
    for (let y = by*BLOCK; y < by*BLOCK+BLOCK; y++)
      for (let x = bx*BLOCK; x < bx*BLOCK+BLOCK; x++) toClear.add(x + y * GRID);
  }

  if (toClear.size === 0) return 0;

  for (const k of toClear) {
    const x = k % GRID, y = Math.floor(k / GRID);
    if (grid[y][x]) {
      clearingCells.push({ x, y, color: grid[y][x].color, t: 0 });
      grid[y][x] = null;
    }
  }

  return toClear.size + (rows.size + cols.size + blocks.size) * 10;
}

function anyFits() {
  for (const p of tray) {
    if (!p) continue;
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++)
        if (canPlace(p.shape, x, y)) return true;
  }
  return false;
}

function afterPlace() {
  if (tray.every(p => p === null)) newTray();
  if (!anyFits()) showGameOver();
}

// ── Input ────────────────────────────────────────
function getPointer(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

function getSnapPos(curX, curY, bb) {
  const tlX = curX - (bb.w * cell) / 2;
  const tlY = curY - (bb.h * cell) / 2;
  return {
    col: Math.round((tlX - boardX) / cell) - bb.minX,
    row: Math.round((tlY - boardY) / cell) - bb.minY,
  };
}

function hitTrayPiece(px, py) {
  for (let i = 0; i < 3; i++) {
    const piece = tray[i];
    if (!piece) continue;
    const origin = trayOrigins[i];
    const bb = pieceBBox(piece.shape);
    const cs = origin.cellSize;
    const px0 = origin.x - (bb.w * cs) / 2;
    const py0 = origin.y - (bb.h * cs) / 2;
    if (px >= px0 - cs*0.3 && px <= px0 + bb.w*cs + cs*0.3 &&
        py >= py0 - cs*0.3 && py <= py0 + bb.h*cs + cs*0.3)
      return { idx: i, bb };
  }
  return null;
}

function onDown(e) {
  if (gameState !== 'playing') return;
  e.preventDefault();
  const p   = getPointer(e);
  const hit = hitTrayPiece(p.x, p.y);
  if (!hit) return;
  const piece = tray[hit.idx];
  // Touch: lift piece above thumb so it’s visible.
  // Mouse: no jump — piece stays exactly where clicked.
  const liftY = e.pointerType === 'touch' ? cell * 2.2 : 0;
  drag = {
    pieceIdx: hit.idx,
    shape: piece.shape,
    color: piece.color,
    bb: hit.bb,
    curX: p.x,
    curY: p.y - liftY,
    liftY,
    pointerId: e.pointerId,
  };
  try { canvas.setPointerCapture(e.pointerId); } catch { }
}

function onMove(e) {
  if (!drag) return;
  e.preventDefault();
  const p = getPointer(e);
  drag.curX = p.x;
  drag.curY = p.y - drag.liftY;
}

function onUp(e) {
  if (!drag) return;
  e.preventDefault();
  const { col, row } = getSnapPos(drag.curX, drag.curY, drag.bb);
  if (canPlace(drag.shape, col, row)) {
    place(drag.shape, drag.color, col, row);
    score += drag.shape.length + checkClears();
    if (score > best) { best = score; saveBest(); }
    tray[drag.pieceIdx] = null;
    updateHud();
    afterPlace();
    if (gameState !== 'dead') saveState();
  }
  drag = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { }
}

canvas.addEventListener('pointerdown',  onDown,  { passive: false });
canvas.addEventListener('pointermove',  onMove,  { passive: false });
canvas.addEventListener('pointerup',    onUp,    { passive: false });
canvas.addEventListener('pointercancel', () => { drag = null; });

// ── Rendering ────────────────────────────────────
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);   ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);   ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);     ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function drawBlock(x, y, size, color, alpha = 1) {
  const pad = Math.max(1, size * 0.05);
  const r   = size * 0.05;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Flat fill — base color only
  ctx.fillStyle = color;
  roundRect(x+pad, y+pad, size-pad*2, size-pad*2, r);
  ctx.fill();

  // Subtle inner shadow at bottom edge
  ctx.fillStyle = colorDarken(color, 40);
  ctx.globalAlpha = alpha * 0.35;
  roundRect(x+pad, y+size-pad-size*0.18, size-pad*2, size*0.18, r);
  ctx.fill();

  ctx.restore();
}

function drawBoard() {
  const gridColor  = getGridColor();
  const bpr = GRID / BLOCK;

  // board background — slightly darkened bg color
  ctx.fillStyle = colorDarken(getBgColor(), 12);
  roundRect(boardX - 6*DPR, boardY - 6*DPR, boardSize + 12*DPR, boardSize + 12*DPR, 12*DPR);
  ctx.fill();

  const ga = getGridAlpha();

  // sub-block checker: grid color tint
  ctx.fillStyle = themeRgba(gridColor, 0.25 * ga);
  for (let by = 0; by < bpr; by++) {
    for (let bx = 0; bx < bpr; bx++) {
      if ((bx + by) % 2 === 1)
        ctx.fillRect(boardX + bx*BLOCK*cell, boardY + by*BLOCK*cell, BLOCK*cell, BLOCK*cell);
    }
  }

  // thin cell grid lines
  ctx.strokeStyle = themeRgba(gridColor, ga);
  ctx.lineWidth   = 1;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(boardX + i*cell, boardY); ctx.lineTo(boardX + i*cell, boardY + boardSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(boardX, boardY + i*cell); ctx.lineTo(boardX + boardSize, boardY + i*cell); ctx.stroke();
  }

  // thick block-boundary lines
  ctx.strokeStyle = themeRgba(gridColor, ga);
  ctx.lineWidth   = 2;
  for (let i = 0; i <= GRID; i += BLOCK) {
    ctx.beginPath(); ctx.moveTo(boardX + i*cell, boardY); ctx.lineTo(boardX + i*cell, boardY + boardSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(boardX, boardY + i*cell); ctx.lineTo(boardX + boardSize, boardY + i*cell); ctx.stroke();
  }

  // ghost preview
  if (drag) {
    const { col, row } = getSnapPos(drag.curX, drag.curY, drag.bb);
    if (canPlace(drag.shape, col, row)) {
      for (const [dx, dy] of drag.shape)
        drawBlock(boardX + (col+dx)*cell, boardY + (row+dy)*cell, cell, drag.color, 0.35);
    }
  }

  // placed blocks
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (grid[y][x]) drawBlock(boardX + x*cell, boardY + y*cell, cell, grid[y][x].color);

  // clearing animation
  for (const c of clearingCells) {
    const a = 1 - c.t;
    const s = cell * (1 + c.t * 0.4);
    drawBlock(boardX + c.x*cell - (s-cell)/2, boardY + c.y*cell - (s-cell)/2, s, c.color, a);
  }
}

function drawTray() {
  for (let i = 0; i < 3; i++) {
    const piece = tray[i];
    if (!piece || (drag && drag.pieceIdx === i)) continue;
    const origin = trayOrigins[i];
    const bb     = pieceBBox(piece.shape);
    const cs     = origin.cellSize;
    const px0    = origin.x - (bb.w * cs) / 2;
    const py0    = origin.y - (bb.h * cs) / 2;
    for (const [x, y] of piece.shape)
      drawBlock(px0 + (x - bb.minX)*cs, py0 + (y - bb.minY)*cs, cs, piece.color);
  }
}

function drawDragged() {
  if (!drag) return;
  const bb   = drag.bb;
  const tlX  = drag.curX - (bb.w * cell) / 2;
  const tlY  = drag.curY - (bb.h * cell) / 2;
  const { col, row } = getSnapPos(drag.curX, drag.curY, bb);
  const valid = canPlace(drag.shape, col, row);
  for (const [x, y] of drag.shape)
    drawBlock(tlX + (x - bb.minX)*cell, tlY + (y - bb.minY)*cell, cell, drag.color, valid ? 1 : 0.65);
}

// ── Main loop ────────────────────────────────────
let lastT = performance.now();

function loop(now) {
  const dt = Math.min((now - lastT) / 1000, 1/20);
  lastT = now;

  ctx.fillStyle = getBgColor();
  ctx.fillRect(0, 0, W, H);

  if (gameState === 'playing' && grid) {
    drawBoard();
    drawTray();
    drawDragged();
    for (let i = clearingCells.length - 1; i >= 0; i--) {
      clearingCells[i].t += dt * 2.5;
      if (clearingCells[i].t >= 1) clearingCells.splice(i, 1);
    }
  }

  requestAnimationFrame(loop);
}

// ── Settings Drawer ──────────────────────────────
function openDrawer() {
  const drawer = document.getElementById('settingsDrawer');
  drawer.classList.add('open');

  // Background color picker
  const bgPicker = document.getElementById('bgPicker');
  bgPicker.value = getBgColor();
  bgPicker.oninput = () => {
    localStorage.setItem('BD_BG', bgPicker.value);
    applyAccent();
  };
  document.getElementById('bgReset').onclick = () => {
    localStorage.removeItem('BD_BG');
    localStorage.removeItem('BD_BLOCK');
    bgPicker.value = DEFAULTS.bg;
    blockPicker.value = DEFAULTS.block;
    applyAccent();
    if (tray) tray.forEach(p => { if (p) p.color = DEFAULTS.block; });
    if (grid) grid.forEach(row => row.forEach(cell => { if (cell) cell.color = DEFAULTS.block; }));
  };

  // Block color picker
  const blockPicker = document.getElementById('blockPicker');
  blockPicker.value = getBlockColor();
  blockPicker.oninput = () => {
    localStorage.setItem('BD_BLOCK', blockPicker.value);
    applyAccent();
    if (tray) tray.forEach(p => { if (p) p.color = blockPicker.value; });
    if (grid) grid.forEach(row => row.forEach(cell => { if (cell) cell.color = blockPicker.value; }));
  };

  // Grid color picker
  const gridPicker = document.getElementById('gridPicker');
  gridPicker.value = getGridColor();
  gridPicker.oninput = () => {
    localStorage.setItem('BD_GRID', gridPicker.value);
  };

  // Grid alpha slider
  const gridAlpha = document.getElementById('gridAlpha');
  gridAlpha.value = getGridAlpha();
  gridAlpha.oninput = () => {
    localStorage.setItem('BD_GRID_ALPHA', gridAlpha.value);
  };
}

function closeDrawer() {
  document.getElementById('settingsDrawer').classList.remove('open');
}

// ── Init ─────────────────────────────────────────
applyAccent();
resize();
showMenu();
requestAnimationFrame(loop);
