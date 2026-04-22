/**
 * MapEditor — pełnoekranowy edytor planszy z zoomem i rysowaniem.
 * Otwierany przez Ctrl+P w main.js.
 */
import { WORLD_SIZE } from '../constants.js';

const GRID_SIZE = 100;
const CELL_WORLD = WORLD_SIZE / GRID_SIZE; // rozmiar cella w metrach (12m przy WORLD_SIZE=1200)

const TOOLS = {
  empty:       { color: '#4a7c4e', label: 'Trawa',        text: '#fff' },
  building:    { color: '#6a6a6a', label: 'Budynek',      text: '#fff' },
  road:        { color: '#1a1a1a', label: 'Ulica',        text: '#fff' },
  tree:        { color: '#2d6a2d', label: 'Drzewo',       text: '#fff' },
  obstacle:    { color: '#7a4a1e', label: 'Przeszkoda',   text: '#fff' },
  ramp:        { color: '#c8a000', label: 'Rampa',        text: '#000' },
  bank:        { color: '#cc4030', label: 'Skarp/Bank',   text: '#fff' },
  launchPad:   { color: '#00a0b0', label: 'Wyrzutnia',    text: '#000' },
  zombieSpawn: { color: '#a00020', label: 'Zombie Spawn', text: '#fff' },
};

const SIDEBAR_W = 190;

export class MapEditor {
  constructor() {
    this.currentTool = 'building';
    this.grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill('empty'));

    this._zoom     = 6;
    this._panX     = 0;
    this._panY     = 0;
    this._painting = false;
    this._lastCell = null;

    this._buildUI();
  }

  // ─── UI ────────────────────────────────────────────────────────────
  _buildUI() {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100vw', height: '100vh',
      background: '#1a1a2e',
      zIndex: '5000',
      display: 'flex', flexDirection: 'row',
      fontFamily: 'sans-serif',
      userSelect: 'none',
    });

    // ── Sidebar ────────────────────────────────────────────────────
    const sidebar = document.createElement('div');
    Object.assign(sidebar.style, {
      width: `${SIDEBAR_W}px`,
      minWidth: `${SIDEBAR_W}px`,
      background: '#16213e',
      color: '#ccc',
      padding: '10px 8px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      overflowY: 'auto',
    });

    const heading = document.createElement('div');
    heading.textContent = 'Edytor Planszy';
    heading.style.cssText = 'font-size:14px;font-weight:bold;color:#88aaff;margin-bottom:6px;';
    sidebar.appendChild(heading);

    const toolLabel = document.createElement('div');
    toolLabel.textContent = 'Narzędzia:';
    toolLabel.style.cssText = 'font-size:11px;color:#888;';
    sidebar.appendChild(toolLabel);

    // tool buttons
    this._toolBtns = {};
    for (const [type, info] of Object.entries(TOOLS)) {
      const btn = document.createElement('button');
      btn.textContent = info.label;
      Object.assign(btn.style, {
        background: info.color,
        color: info.text,
        border: '2px solid transparent',
        padding: '6px 4px',
        cursor: 'pointer',
        borderRadius: '3px',
        width: '100%',
        boxSizing: 'border-box',
        fontSize: '12px',
        textAlign: 'left',
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectTool(type);
      });
      sidebar.appendChild(btn);
      this._toolBtns[type] = btn;
    }
    this._selectTool('building');

    sidebar.appendChild(this._sep());

    this._zoomLabel = document.createElement('div');
    this._zoomLabel.style.cssText = 'font-size:11px;color:#888;text-align:center;';
    sidebar.appendChild(this._zoomLabel);

    const hint = document.createElement('div');
    hint.textContent = 'Scroll = zoom  |  drag = rysuj';
    hint.style.cssText = 'font-size:10px;color:#555;text-align:center;';
    sidebar.appendChild(hint);

    sidebar.appendChild(this._sep());

    sidebar.appendChild(this._actionBtn('Wyczyść grid', '#7a2020', () => {
      if (confirm('Wyczyścić całą planszę?')) {
        this.grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill('empty'));
        this._draw();
      }
    }));
    sidebar.appendChild(this._actionBtn('Zapisz planszę', '#1a5c2a', () => this._saveMap()));
    sidebar.appendChild(this._actionBtn('Usuń planszę',   '#5c2a1a', () => this._deleteMap()));

    sidebar.appendChild(this._sep());

    sidebar.appendChild(this._actionBtn('Zamknij', '#333', () => this.close()));

    // ── Canvas wrap ────────────────────────────────────────────────
    this._canvasWrap = document.createElement('div');
    Object.assign(this._canvasWrap.style, {
      flex: '1',
      position: 'relative',
      overflow: 'hidden',
    });

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;cursor:crosshair;';
    this._canvasWrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.overlay.appendChild(sidebar);
    this.overlay.appendChild(this._canvasWrap);

    // events
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this._canvasWrap);

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this._painting = true;
      this._lastCell = null;
      this._paintAtEvent(e);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this._painting) this._paintAtEvent(e);
    });
    window.addEventListener('mouseup', () => {
      this._painting = false;
      this._lastCell = null;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._onWheel(e);
    }, { passive: false });
  }

  _sep() {
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px solid #333;margin:4px 0;';
    return hr;
  }

  _actionBtn(label, bg, fn) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: bg, color: '#fff', border: 'none',
      padding: '7px 4px', cursor: 'pointer', borderRadius: '3px',
      width: '100%', boxSizing: 'border-box', fontSize: '12px',
    });
    btn.addEventListener('click', fn);
    return btn;
  }

  // ─── Tool selection ────────────────────────────────────────────────
  _selectTool(type) {
    this.currentTool = type;
    for (const [t, btn] of Object.entries(this._toolBtns)) {
      btn.style.border    = t === type ? '2px solid #fff' : '2px solid transparent';
      btn.style.boxShadow = t === type ? '0 0 4px #fff8' : 'none';
    }
  }

  // ─── Resize ────────────────────────────────────────────────────────
  _resizeCanvas() {
    const rect = this._canvasWrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.canvas.width  = rect.width;
    this.canvas.height = rect.height;
    this._fitGrid();
    this._draw();
  }

  _fitGrid() {
    const cw  = this.canvas.width;
    const ch  = this.canvas.height;
    const fit = Math.min(cw, ch);
    this._zoom = Math.max(1, fit / GRID_SIZE);
    this._panX = (cw - this._zoom * GRID_SIZE) / 2;
    this._panY = (ch - this._zoom * GRID_SIZE) / 2;
  }

  // ─── Painting ──────────────────────────────────────────────────────
  _paintAtEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cx = Math.floor((sx - this._panX) / this._zoom);
    const cy = Math.floor((sy - this._panY) / this._zoom);
    const key = `${cx},${cy}`;
    if (this._lastCell === key) return;
    this._lastCell = key;
    if (cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE) {
      this.grid[cy][cx] = this.currentTool;
      this._drawCellPx(cx, cy);
      if (this._zoom >= 4) this._redrawGridLinesAround(cx, cy);
    }
  }

  // ─── Zoom ──────────────────────────────────────────────────────────
  _onWheel(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const newZ   = Math.max(1, Math.min(48, this._zoom * factor));
    this._panX   = mx - (mx - this._panX) * (newZ / this._zoom);
    this._panY   = my - (my - this._panY) * (newZ / this._zoom);
    this._zoom   = newZ;
    this._draw();
  }

  // ─── Drawing ───────────────────────────────────────────────────────
  _draw() {
    const { ctx, canvas } = this;
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, cw, ch);

    const z  = this._zoom;
    const x0 = Math.max(0, Math.floor(-this._panX / z));
    const y0 = Math.max(0, Math.floor(-this._panY / z));
    const x1 = Math.min(GRID_SIZE, Math.ceil((cw - this._panX) / z));
    const y1 = Math.min(GRID_SIZE, Math.ceil((ch - this._panY) / z));

    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        this._drawCellPx(cx, cy);
      }
    }
    if (z >= 4) this._drawAllGridLines(x0, y0, x1, y1);
    this._zoomLabel.textContent = `Zoom: ${Math.round(z)}px/cell`;
  }

  _drawCellPx(cx, cy) {
    const { ctx } = this;
    const z  = this._zoom;
    const px = Math.floor(this._panX + cx * z);
    const py = Math.floor(this._panY + cy * z);
    const pw = Math.ceil(z);
    ctx.fillStyle = TOOLS[this.grid[cy][cx]].color;
    ctx.fillRect(px, py, pw, pw);
  }

  _drawAllGridLines(x0, y0, x1, y1) {
    const { ctx } = this;
    const z = this._zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let cx = x0; cx <= x1; cx++) {
      const px = Math.floor(this._panX + cx * z) + 0.5;
      ctx.moveTo(px, this._panY + y0 * z);
      ctx.lineTo(px, this._panY + y1 * z);
    }
    for (let cy = y0; cy <= y1; cy++) {
      const py = Math.floor(this._panY + cy * z) + 0.5;
      ctx.moveTo(this._panX + x0 * z, py);
      ctx.lineTo(this._panX + x1 * z, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  _redrawGridLinesAround(cx, cy) {
    const z = this._zoom;
    // only repaint the tiny border of one cell
    const px = Math.floor(this._panX + cx * z);
    const py = Math.floor(this._panY + cy * z);
    const pw = Math.ceil(z);
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px + 0.5, py + 0.5, pw, pw);
    ctx.restore();
  }

  // ─── Persistence ───────────────────────────────────────────────────
  _saveMap() {
    const name = prompt('Nazwa planszy:');
    if (!name || !name.trim()) return;
    const key  = name.trim();
    const maps = JSON.parse(localStorage.getItem('zombieRacerMaps') || '{}');
    maps[key]  = this._buildMapData();
    localStorage.setItem('zombieRacerMaps', JSON.stringify(maps));
    alert(`Plansza "${key}" zapisana.`);
  }

  _deleteMap() {
    const maps  = JSON.parse(localStorage.getItem('zombieRacerMaps') || '{}');
    const names = Object.keys(maps);
    if (!names.length) { alert('Brak zapisanych plansz.'); return; }
    const name = prompt(`Podaj nazwę do usunięcia:\n${names.join('\n')}`);
    if (!name || !name.trim()) return;
    const key = name.trim();
    if (!maps[key]) { alert(`Nie znaleziono planszy "${key}".`); return; }
    if (!confirm(`Usunąć planszę "${key}"?`)) return;
    delete maps[key];
    localStorage.setItem('zombieRacerMaps', JSON.stringify(maps));
    alert(`Plansza "${key}" usunięta.`);
  }

  _buildMapData() {
    const map = {
      buildings: [], ramps: [], banks: [], launchPads: [],
      trees: [], obstacles: [], roads: [], zombieSpawns: [],
    };
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const type = this.grid[y][x];
        if (type === 'empty') continue;
        const px = (x - GRID_SIZE / 2 + 0.5) * CELL_WORLD;
        const pz = (y - GRID_SIZE / 2 + 0.5) * CELL_WORLD;
        if      (type === 'building')    map.buildings.push({ x: px, z: pz, w: 20, d: 20, h: 20 });
        else if (type === 'tree')        map.trees.push({ x: px, z: pz });
        else if (type === 'obstacle')    map.obstacles.push({ x: px, z: pz });
        else if (type === 'ramp')        map.ramps.push({ x: px, z: pz, length: 36, width: 14, rotY: 0, angleX: 0.3 });
        else if (type === 'bank')        map.banks.push({ x: px, z: pz, bw: 24, bd: 28, tw: 8, h: 5, rotY: 0 });
        else if (type === 'launchPad')   map.launchPads.push({ x: px, z: pz, w: 7, d: 7, launchForce: 24 });
        else if (type === 'zombieSpawn') map.zombieSpawns.push({ x: px, z: pz });
        else if (type === 'road')        map.roads.push({ x: px, z: pz, w: CELL_WORLD, d: CELL_WORLD });
      }
    }
    return map;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────
  show() {
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => this._resizeCanvas());
  }

  close() {
    this._resizeObserver.disconnect();
    window.removeEventListener('mouseup', this._onMouseUp);
    if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }
}

