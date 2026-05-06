import * as THREE from 'three';
import { createInfiniteSpline } from './procedural/infiniteSpline.js';
import { InfiniteMesh, TUNNEL_FX_CONFIG } from './procedural/infiniteMesh.js';
import { createCrossSection } from './procedural/crossSection.js';
import { createAudioSystem, AudioMetadataBus } from './audio/index.js';

// ── Capture defaults before any edits ─────────────────────────────────────────
const DEFAULTS = JSON.parse(JSON.stringify(TUNNEL_FX_CONFIG));

// ── Apply last exported editor state (overrides defaults at startup) ───────────
(function applyStartConfig() {
  const c = TUNNEL_FX_CONFIG;
  c.fxBass = 2; c.fxBeat = 2; c.fxOnset = 1.57; c.fxMid = 1.27; c.fxEnergy = 0.75;
  c.shakeAmp = 0.04294060221381721; c.waveAmp = 2.915408874527218; c.emergeDist = 310;
  c.layerCyclePeriod = 3.3; c.brightCyclePeriod = 5; c.brightMin = 0.12; c.brightMax = 1.11;
  Object.assign(c.parallax, { amount: 2, flow: 1.46, depthStretch: 4.38, audioPush: 0, deltaA: 0.36, deltaS: -0.56 });
  Object.assign(c.parallax.layerDepth, {
    bgFlares: -0.62, lava: 0.41, lavaDeep: 1.21, waveform: 1.29,
    longBlue: 0.95, longOrange: 0.46, twistBlue: 0.13, twistOrange: 0.78,
    grid: -1.12, strips: 0.78, tilesOrange: -1.11, tilesBlue: 1.16, chevrons: -0.91, frontPalette: 0.12,
  });
  c.baseNavy.splice(0, 3, 0, 0.015, 0.15);
  c.deepNavy.splice(0, 3, 0.136, 0.035, 0.105);
  c.structureBlue.splice(0, 3, 0, 0.3, 0.85);
  c.waveformBlue.splice(0, 3, 0.07, 0.52, 1);
  c.electricBlue.splice(0, 3, 0.02, 0.682, 1.477);
  c.lavaColorDark.splice(0, 3, 0.33, 0.07, 0);
  c.lavaColorMid.splice(0, 3, 0.9, 0.22, 0.02);
  c.lavaColorHot.splice(0, 3, 1, 0.36, 0.02);
  c.dashOrange.splice(0, 3, 1, 0.3, 0.02);
  c.edgeOrange.splice(0, 3, 1, 0.22, 0);
  c.contactWarm.splice(0, 3, 1, 0.5, 0.12);
  c.accentRed.splice(0, 3, 1.5, 0.04, 0.02);
  c.accentEmerald.splice(0, 3, 0, 0.95, 0.65);
  c.accentAfrican.splice(0, 3, 1, 0.52, 0.05);
  c.accentFuchsia.splice(0, 3, 1, 0.048, 0.16);
  const op = c.opacity;
  Object.assign(op.grid,         { min: 0.99, max: 1.5,  smooth: 12.1 });
  Object.assign(op.waveform,     { min: 0,    max: 1,    smooth: 4    });
  Object.assign(op.lava,         { min: 0.39, max: 0.85, smooth: 3.2  });
  Object.assign(op.lavaDeep,     { min: 0.35, max: 0.7,  smooth: 4.5  });
  Object.assign(op.strips,       { min: 0,    max: 0.9,  smooth: 5    });
  Object.assign(op.longBands,    { min: 0,    max: 0.85, smooth: 3.5  });
  Object.assign(op.twistBands,   { min: 0,    max: 0.95, smooth: 4.5  });
  Object.assign(op.tilesOrange,  { min: 0,    max: 0.95, smooth: 8    });
  Object.assign(op.tilesBlue,    { min: 0,    max: 0.6,  smooth: 4    });
  Object.assign(op.chevrons,     { min: 0.17, max: 0.82, smooth: 9    });
  Object.assign(op.floorEdge,    { min: 1.19, max: 1.5,  smooth: 15   });
  Object.assign(op.contact,      { min: 0.3,  max: 1,    smooth: 10   });
  Object.assign(op.bgFlares,     { min: 0.34, max: 0.85, smooth: 1.2  });
  Object.assign(op.frontPalette, { min: 0,    max: 0.85, smooth: 5.5  });
})();

// ── Renderer / scene / camera ─────────────────────────────────────────────────
const canvasWrapper = document.getElementById('canvas-wrapper');
const canvas        = document.getElementById('editor-canvas');
const renderer      = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040c);
scene.fog        = new THREE.Fog(0x040816, 28, 220);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 600);

// ── Procedural tunnel (no ball) ───────────────────────────────────────────────
const spline = createInfiniteSpline(42);
spline.extend(2000);
const cs          = createCrossSection();
const infiniteMesh = new InfiniteMesh(scene, spline, cs);

// ── Audio system (real capture + bridge) ──────────────────────────────────────
const audioSystem = createAudioSystem();
audioSystem.bridge.register(infiniteMesh.material);

// ── Simulation state ──────────────────────────────────────────────────────────
const SPEED_MS  = 350 / 3.6; // 97.2 m/s ≈ 350 km/h
let playerGlobalS = 200;
let prevTime      = performance.now();
const _lookAt     = new THREE.Vector3();

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  const w = canvasWrapper.clientWidth;
  const h = canvasWrapper.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvasWrapper);
resize();

// ── Fake ambient audio (makes the tunnel look alive) ──────────────────────────
function pushFakeAudio(t) {
  const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * (128 / 60))), 4);
  AudioMetadataBus.push({
    sub:         0.30 + 0.20 * Math.sin(t * 0.50),
    low:         0.40 + 0.30 * Math.sin(t * 0.70),
    mid:         0.30 + 0.20 * Math.sin(t * 1.10),
    high:        0.20 + 0.15 * Math.sin(t * 1.70),
    rms:         0.38 + 0.22 * Math.sin(t * 0.30),
    bassImpact:  beat * 0.85,
    midWave:     0.30 + 0.20 * Math.sin(t * 0.90),
    lavaLight:   0.40 + 0.30 * Math.sin(t * 0.60),
    ribbonDrive: 0.35 + 0.25 * Math.sin(t * 0.80),
    beatPulse:   beat * 0.90,
    onsetPulse:  Math.max(0, Math.sin(t * 3.10)) * 0.45,
    isOnset:     beat > 0.90,
    bpm:         128,
    chroma: [
      0.10 + 0.10 * Math.sin(t * 0.20),
      0,
      0.20 + 0.10 * Math.sin(t * 0.30),
    ],
  });
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - prevTime) / 1000, 0.05);
  prevTime  = now;
  const t   = now / 1000;

  playerGlobalS += SPEED_MS * dt;
  spline.extend(playerGlobalS + 900);
  if (!audioSystem.isActive) pushFakeAudio(t);
  audioSystem.tick(dt);

  const frame = spline.getFrameAt(playerGlobalS);
  if (frame) {
    camera.position.copy(frame.pos).addScaledVector(frame.nor, 0.5);
    _lookAt.copy(frame.pos).addScaledVector(frame.tan, 20);
    camera.up.copy(frame.nor);
    camera.lookAt(_lookAt);
  }

  infiniteMesh.update(playerGlobalS, camera.position, dt);
  renderer.render(scene, camera);
}
animate();

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLS UI
// ══════════════════════════════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────────────────────────────
function cfgGet(path) {
  return path.reduce((o, k) => o[k], TUNNEL_FX_CONFIG);
}

function cfgSet(path, value) {
  const last   = path[path.length - 1];
  const parent = path.slice(0, -1).reduce((o, k) => o[k], TUNNEL_FX_CONFIG);
  parent[last]  = typeof parent[last] === 'number' ? parseFloat(value) : value;
}

function linToSRGB(v) {
  return Math.round(Math.pow(Math.min(Math.max(v, 0), 1), 1 / 2.2) * 255);
}

function swatchCSS(arr) {
  return `rgb(${linToSRGB(arr[0])},${linToSRGB(arr[1])},${linToSRGB(arr[2])})`;
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

// ── Control builders ──────────────────────────────────────────────────────────
function makeSlider(label, path, min, max, step, hint = '') {
  const id  = 'ctrl-' + path.join('_');
  const val = cfgGet(path);
  const el  = document.createElement('div');
  el.className = 'ctrl';
  el.innerHTML = `
    <div class="ctrl-header">
      <label for="${id}">${label}</label>
      <input id="${id}-num" type="number" min="${min}" max="${max}" step="${step}" value="${fmt(val)}">
    </div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}">
    ${hint ? `<div class="ctrl-hint">${hint}</div>` : ''}
  `;
  const range = el.querySelector(`#${id}`);
  const num   = el.querySelector(`#${id}-num`);
  range.addEventListener('input', () => {
    num.value = fmt(parseFloat(range.value));
    cfgSet(path, range.value);
  });
  num.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, parseFloat(num.value) || 0));
    num.value   = fmt(v);
    range.value = v;
    cfgSet(path, v);
  });
  return el;
}

function makeColorControl(label, path, maxVal) {
  const arr    = cfgGet(path);
  const swId   = 'sw-' + path.join('_');
  const el     = document.createElement('div');
  el.className = 'ctrl ctrl-color';
  el.innerHTML = `
    <div class="ctrl-header">
      <span>
        <span class="color-swatch" id="${swId}" style="background:${swatchCSS(arr)}"></span>
        <label>${label}</label>
      </span>
    </div>
    <div class="color-channels">
      ${['R','G','B'].map((ch, i) => `
        <div class="ch-row">
          <span>${ch}</span>
          <input type="range"   data-ri="${i}" min="0" max="${maxVal}" step="0.001" value="${arr[i]}">
          <input type="number"  data-ni="${i}" min="0" max="${maxVal}" step="0.001" value="${fmt(arr[i])}">
        </div>
      `).join('')}
    </div>
  `;
  const swatch = el.querySelector(`#${swId}`);

  el.querySelectorAll('input[type=range]').forEach(r => {
    r.addEventListener('input', () => {
      const i   = parseInt(r.dataset.ri);
      const v   = parseFloat(r.value);
      const cur = cfgGet(path);
      cur[i]    = v;
      el.querySelector(`input[data-ni="${i}"]`).value = fmt(v);
      swatch.style.background = swatchCSS(cur);
    });
  });

  el.querySelectorAll('input[type=number]').forEach(n => {
    n.addEventListener('change', () => {
      const i   = parseInt(n.dataset.ni);
      const v   = Math.max(0, parseFloat(n.value) || 0);
      n.value   = fmt(v);
      const cur = cfgGet(path);
      cur[i]    = v;
      el.querySelector(`input[data-ri="${i}"]`).value = v;
      swatch.style.background = swatchCSS(cur);
    });
  });

  return el;
}

// Re-sync all visible inputs after preset apply / reset
function refreshControls() {
  // sliders
  document.querySelectorAll('input[type=range][data-path]').forEach(r => {
    try {
      const path = JSON.parse(r.dataset.path);
      const v    = cfgGet(path);
      if (typeof v === 'number') {
        r.value = v;
        const num = document.querySelector(`input[data-numpath='${r.dataset.path}']`);
        if (num) num.value = fmt(v);
      }
    } catch { /* skip */ }
  });

  // color swatches
  document.querySelectorAll('.ctrl-color').forEach(el => {
    const sw = el.querySelector('.color-swatch');
    if (!sw) return;
    const pathStr = sw.dataset.path;
    if (!pathStr) return;
    try {
      const path = JSON.parse(pathStr);
      const arr  = cfgGet(path);
      el.querySelectorAll('input[type=range]').forEach(r => {
        const i = parseInt(r.dataset.ri);
        r.value = arr[i];
        const n = el.querySelector(`input[data-ni="${i}"]`);
        if (n) n.value = fmt(arr[i]);
      });
      sw.style.background = swatchCSS(arr);
    } catch { /* skip */ }
  });
}

// ── We need data-path attributes to support refreshControls ──────────────────
// Override makeSlider to add data-path
function makeSliderTracked(label, path, min, max, step, hint = '') {
  const el    = makeSlider(label, path, min, max, step, hint);
  const range = el.querySelector('input[type=range]');
  const num   = el.querySelector('input[type=number]');
  const ps    = JSON.stringify(path);
  if (range) { range.dataset.path    = ps; }
  if (num)   { num.dataset.numpath   = ps; }
  return el;
}

// Override makeColorControl to add data-path on swatch
function makeColorTracked(label, path, maxVal) {
  const el = makeColorControl(label, path, maxVal);
  const sw = el.querySelector('.color-swatch');
  if (sw) sw.dataset.path = JSON.stringify(path);
  return el;
}

// ── Presets ────────────────────────────────────────────────────────────────────
const PRESETS = [
  {
    name: 'DEFAULT',
    desc: 'Original defaults — restore everything',
    apply() {
      const fresh = JSON.parse(JSON.stringify(DEFAULTS));
      Object.assign(TUNNEL_FX_CONFIG, fresh);
      TUNNEL_FX_CONFIG.parallax = JSON.parse(JSON.stringify(DEFAULTS.parallax));
      TUNNEL_FX_CONFIG.opacity  = JSON.parse(JSON.stringify(DEFAULTS.opacity));
    },
  },
  {
    name: 'ALL BLUE',
    desc: 'Kill the orange — pure electric blue cold tunnel',
    apply() {
      Object.assign(TUNNEL_FX_CONFIG, {
        lavaColorDark: [0.000, 0.030, 0.150],
        lavaColorMid:  [0.020, 0.200, 0.900],
        lavaColorHot:  [0.050, 0.500, 1.200],
        dashOrange:    [0.020, 0.350, 1.000],
        edgeOrange:    [0.010, 0.450, 1.200],
        contactWarm:   [0.030, 0.600, 1.000],
        accentAfrican: [0.050, 0.300, 1.000],
      });
    },
  },
  {
    name: 'INFERNO',
    desc: 'Max heat — red-orange lava hell',
    apply() {
      Object.assign(TUNNEL_FX_CONFIG, {
        baseNavy:      [0.025, 0.005, 0.000],
        deepNavy:      [0.060, 0.010, 0.000],
        structureBlue: [0.800, 0.100, 0.020],
        waveformBlue:  [1.000, 0.150, 0.020],
        electricBlue:  [1.000, 0.200, 0.050],
        lavaColorDark: [0.500, 0.040, 0.000],
        lavaColorMid:  [1.200, 0.150, 0.000],
        lavaColorHot:  [1.500, 0.450, 0.010],
        edgeOrange:    [1.500, 0.250, 0.000],
        dashOrange:    [1.500, 0.200, 0.000],
        contactWarm:   [1.500, 0.600, 0.050],
      });
    },
  },
  {
    name: 'VOID',
    desc: 'Near-black, deep violet edges',
    apply() {
      Object.assign(TUNNEL_FX_CONFIG, {
        baseNavy:      [0.000, 0.000, 0.010],
        deepNavy:      [0.002, 0.000, 0.030],
        structureBlue: [0.020, 0.010, 0.150],
        waveformBlue:  [0.030, 0.010, 0.200],
        electricBlue:  [0.050, 0.000, 0.300],
        lavaColorDark: [0.002, 0.000, 0.030],
        lavaColorMid:  [0.020, 0.000, 0.120],
        lavaColorHot:  [0.060, 0.000, 0.300],
        edgeOrange:    [0.050, 0.000, 0.400],
        dashOrange:    [0.040, 0.000, 0.350],
        contactWarm:   [0.080, 0.020, 0.500],
        accentFuchsia: [0.500, 0.000, 0.800],
      });
    },
  },
  {
    name: 'ACID',
    desc: 'Toxic green neon, industrial',
    apply() {
      Object.assign(TUNNEL_FX_CONFIG, {
        baseNavy:      [0.000, 0.010, 0.002],
        deepNavy:      [0.000, 0.040, 0.008],
        structureBlue: [0.020, 0.800, 0.100],
        waveformBlue:  [0.050, 1.000, 0.150],
        electricBlue:  [0.020, 1.000, 0.200],
        lavaColorDark: [0.050, 0.200, 0.000],
        lavaColorMid:  [0.200, 0.900, 0.000],
        lavaColorHot:  [0.500, 1.200, 0.020],
        edgeOrange:    [0.300, 1.000, 0.020],
        dashOrange:    [0.400, 1.000, 0.050],
        contactWarm:   [0.700, 1.000, 0.100],
      });
    },
  },
  {
    name: 'AURORA',
    desc: 'Northern lights — teal, violet, gold',
    apply() {
      Object.assign(TUNNEL_FX_CONFIG, {
        baseNavy:      [0.002, 0.008, 0.020],
        deepNavy:      [0.005, 0.025, 0.060],
        structureBlue: [0.020, 0.500, 0.700],
        waveformBlue:  [0.100, 0.700, 0.900],
        electricBlue:  [0.000, 0.900, 0.800],
        lavaColorDark: [0.100, 0.000, 0.200],
        lavaColorMid:  [0.400, 0.050, 0.700],
        lavaColorHot:  [0.700, 0.100, 1.000],
        edgeOrange:    [0.600, 0.600, 0.000],
        dashOrange:    [0.800, 0.700, 0.020],
        contactWarm:   [0.900, 0.900, 0.500],
        accentEmerald: [0.000, 1.000, 0.700],
        accentFuchsia: [0.800, 0.000, 1.000],
      });
    },
  },
];

// ── Section builders ──────────────────────────────────────────────────────────
const body = document.getElementById('controls-body');

function buildSection(id) {
  body.innerHTML = '';
  switch (id) {
    case 'fx':      buildFX(); break;
    case 'parallax': buildParallax(); break;
    case 'depths':  buildDepths(); break;
    case 'opacity': buildOpacity(); break;
    case 'blues':   buildColors([
      ['baseNavy',      'Base Navy',      0.15],
      ['deepNavy',      'Deep Navy',      0.25],
      ['structureBlue', 'Structure Blue', 1.50],
      ['waveformBlue',  'Waveform Blue',  1.50],
      ['electricBlue',  'Electric Blue',  1.50],
    ]); break;
    case 'oranges': buildColors([
      ['lavaColorDark', 'Lava Dark',    1.20],
      ['lavaColorMid',  'Lava Mid',     1.50],
      ['lavaColorHot',  'Lava Hot',     2.00],
      ['dashOrange',    'Dash Orange',  1.50],
      ['edgeOrange',    'Edge Orange',  1.50],
      ['contactWarm',   'Contact Warm', 1.50],
    ]); break;
    case 'accents': buildColors([
      ['accentRed',     'Accent Red',     1.50],
      ['accentEmerald', 'Accent Emerald', 1.50],
      ['accentAfrican', 'Accent African', 1.50],
      ['accentFuchsia', 'Accent Fuchsia', 1.50],
    ]); break;
    case 'cycles':  buildCycles(); break;
    case 'presets': buildPresets(); break;
    default: break;
  }
}

function hint(text) {
  const el = document.createElement('div');
  el.className = 'section-hint';
  el.textContent = text;
  body.appendChild(el);
}

function buildFX() {
  [
    { label: 'Bass FX',          path: ['fxBass'],     min: 0,  max: 2,    step: 0.01 },
    { label: 'Beat FX',          path: ['fxBeat'],     min: 0,  max: 2,    step: 0.01 },
    { label: 'Onset FX',         path: ['fxOnset'],    min: 0,  max: 2,    step: 0.01 },
    { label: 'Mid FX',           path: ['fxMid'],      min: 0,  max: 2,    step: 0.01 },
    { label: 'Energy FX',        path: ['fxEnergy'],   min: 0,  max: 2,    step: 0.01 },
    { label: 'Emerge Distance',  path: ['emergeDist'], min: 50, max: 1000, step: 10,
      hint: 'How far ahead the tunnel geometry fades in' },
    { label: 'Wave Amplitude',   path: ['waveAmp'],    min: 0,  max: 10,   step: 0.1  },
    { label: 'Shake Amplitude',  path: ['shakeAmp'],   min: 0,  max: 0.5,  step: 0.005},
  ].forEach(s => body.appendChild(makeSliderTracked(s.label, s.path, s.min, s.max, s.step, s.hint)));
}

function buildParallax() {
  hint('Controls fake material-depth parallax. Higher Amount = more 3D depth.');
  [
    { label: 'Amount',        path: ['parallax','amount'],       min: 0,  max: 6,  step: 0.01 },
    { label: 'Flow Speed',    path: ['parallax','flow'],         min: 0,  max: 10, step: 0.01 },
    { label: 'Depth Stretch', path: ['parallax','depthStretch'], min: 0,  max: 8,  step: 0.01 },
    { label: 'Audio Push',    path: ['parallax','audioPush'],    min: 0,  max: 25, step: 0.1  },
    { label: 'Delta A',       path: ['parallax','deltaA'],       min: -1, max: 1,  step: 0.01 },
    { label: 'Delta S',       path: ['parallax','deltaS'],       min: -1, max: 1,  step: 0.01 },
  ].forEach(s => body.appendChild(makeSliderTracked(s.label, s.path, s.min, s.max, s.step)));
}

function buildDepths() {
  hint('Negative = foreground (near camera). Positive = background (far back).');
  const entries = [
    ['bgFlares',    'BG Flares'   ],
    ['lava',        'Lava'        ],
    ['lavaDeep',    'Lava Deep'   ],
    ['waveform',    'Waveform'    ],
    ['longBlue',    'Long Blue'   ],
    ['longOrange',  'Long Orange' ],
    ['twistBlue',   'Twist Blue'  ],
    ['twistOrange', 'Twist Orange'],
    ['grid',        'Grid'        ],
    ['strips',      'Strips'      ],
    ['tilesOrange', 'Tiles Orange'],
    ['tilesBlue',   'Tiles Blue'  ],
    ['chevrons',    'Chevrons'    ],
    ['frontPalette','Front Palette'],
  ];
  entries.forEach(([k, lbl]) =>
    body.appendChild(makeSliderTracked(lbl, ['parallax','layerDepth',k], -2.5, 2.5, 0.01))
  );
}

function buildOpacity() {
  hint('min = floor opacity with no audio. max = ceiling with full audio. smooth = lerp speed.');
  const layers = [
    ['grid',         'Grid'         ],
    ['waveform',     'Waveform'     ],
    ['lava',         'Lava'         ],
    ['lavaDeep',     'Lava Deep'    ],
    ['strips',       'Strips'       ],
    ['longBands',    'Long Bands'   ],
    ['twistBands',   'Twist Bands'  ],
    ['tilesOrange',  'Tiles Orange' ],
    ['tilesBlue',    'Tiles Blue'   ],
    ['chevrons',     'Chevrons'     ],
    ['floorEdge',    'Floor Edge'   ],
    ['contact',      'Contact Glow' ],
    ['bgFlares',     'BG Flares'    ],
    ['frontPalette', 'Front Palette'],
  ];
  layers.forEach(([k, lbl]) => {
    const group = document.createElement('div');
    group.className = 'op-group';
    const title = document.createElement('div');
    title.className = 'op-title';
    title.textContent = lbl;
    group.appendChild(title);
    group.appendChild(makeSliderTracked('min',    ['opacity',k,'min'],    0,   1.5, 0.01));
    group.appendChild(makeSliderTracked('max',    ['opacity',k,'max'],    0,   1.5, 0.01));
    group.appendChild(makeSliderTracked('smooth', ['opacity',k,'smooth'], 0.1, 15,  0.1 ));
    body.appendChild(group);
  });
}

function buildColors(list) {
  list.forEach(([key, label, maxVal]) =>
    body.appendChild(makeColorTracked(label, [key], maxVal))
  );
}

function buildCycles() {
  [
    { label: 'Layer Cycle Period (s)', path: ['layerCyclePeriod'],  min: 0.5, max: 30,  step: 0.1  },
    { label: 'Bright Cycle Period (s)',path: ['brightCyclePeriod'], min: 5,   max: 120, step: 1    },
    { label: 'Bright Min',             path: ['brightMin'],          min: 0,   max: 1,   step: 0.01 },
    { label: 'Bright Max',             path: ['brightMax'],          min: 0,   max: 2,   step: 0.01 },
  ].forEach(s => body.appendChild(makeSliderTracked(s.label, s.path, s.min, s.max, s.step)));
}

function buildPresets() {
  hint('Visual presets — applies colour palette changes. Sliders update after apply.');
  PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.innerHTML = `<span class="preset-name">${p.name}</span><span class="preset-desc">${p.desc}</span>`;
    btn.addEventListener('click', () => {
      p.apply();
      refreshControls();
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    body.appendChild(btn);
  });
}

// ── Dropdown ────────────────────────────────────────────────────────────────────
const sel = document.getElementById('section-select');
sel.addEventListener('change', () => buildSection(sel.value));
buildSection('presets'); // start on presets

// ── Footer buttons ─────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const json = JSON.stringify(TUNNEL_FX_CONFIG, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'tunnel-fx.json' });
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(JSON.stringify(TUNNEL_FX_CONFIG, null, 2)).then(() => {
    const btn = document.getElementById('copy-btn');
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults?')) return;
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  Object.assign(TUNNEL_FX_CONFIG, fresh);
  TUNNEL_FX_CONFIG.parallax = JSON.parse(JSON.stringify(DEFAULTS.parallax));
  TUNNEL_FX_CONFIG.opacity  = JSON.parse(JSON.stringify(DEFAULTS.opacity));
  refreshControls();
});

// ── Audio toggle button ────────────────────────────────────────────────────────
const audioBtn    = document.getElementById('audio-btn');
const audioStatus = document.getElementById('audio-status');

function setAudioUI(active, label, statusText, statusColor) {
  audioBtn.textContent = label;
  audioBtn.classList.toggle('audio-active', active);
  audioStatus.textContent = statusText;
  audioStatus.style.color = statusColor;
}

setAudioUI(false, '♫ AUDIO REACTIVE', 'SIM MODE', 'rgba(57,216,255,0.4)');

audioBtn.addEventListener('click', async () => {
  if (audioSystem.isActive) {
    audioSystem.stopCapture();
    setAudioUI(false, '♫ AUDIO REACTIVE', 'SIM MODE', 'rgba(57,216,255,0.4)');
  } else {
    setAudioUI(false, '…CONNECTING', 'CONNECTING…', '#ff7600');
    try {
      await audioSystem.startCapture();
      setAudioUI(true, '■ STOP AUDIO', 'LIVE', '#39d8ff');
    } catch (err) {
      console.warn('Audio capture failed:', err);
      setAudioUI(false, '♫ AUDIO REACTIVE', 'ERROR — ' + err.message.slice(0, 40), '#ff5a5a');
    }
  }
});
