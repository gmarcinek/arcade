/**
 * Mobile controls:
 *   Touch-pad (full screen) — floating-origin joystick, continuous directional input
 *   #jump-btn              — dedicated jump button (hold = charge, release = fire)
 *
 * Joystick axes (independent):
 *   drag up    → boost      drag down  → brake
 *   drag left  → steer L    drag right → steer R
 */

import { input } from '../input.js';
import { state } from '../state.js';

const DEAD  = 22;   // px dead-zone radius
const RANGE = 90;   // px visual range

let touchId = null;
let originX = 0;
let originY = 0;

// ── visual hint ───────────────────────────────────────────────────────────────
let hintEl     = null;
let hintKnobEl = null;
let hideTimer  = null;

function createHint() {
  const ring = document.createElement('div');
  Object.assign(ring.style, {
    position:      'fixed',
    width:         RANGE * 2 + 'px',
    height:        RANGE * 2 + 'px',
    marginLeft:    -RANGE + 'px',
    marginTop:     -RANGE + 'px',
    borderRadius:  '50%',
    border:        '1.5px solid rgba(0,210,255,0.22)',
    pointerEvents: 'none',
    zIndex:        '6',
    opacity:       '0',
    transition:    'opacity 0.12s',
  });
  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position:      'fixed',
    width:         '20px',
    height:        '20px',
    marginLeft:    '-10px',
    marginTop:     '-10px',
    borderRadius:  '50%',
    background:    'rgba(0,210,255,0.4)',
    pointerEvents: 'none',
    zIndex:        '6',
    opacity:       '0',
    transition:    'opacity 0.12s',
  });
  document.body.appendChild(ring);
  document.body.appendChild(knob);
  return { ring, knob };
}

function showHint(ox, oy, cx, cy) {
  if (!hintEl) return;
  clearTimeout(hideTimer);
  hintEl.style.left    = ox + 'px';
  hintEl.style.top     = oy + 'px';
  hintEl.style.opacity = '1';
  const dx = cx - ox, dy = cy - oy;
  const dist  = Math.sqrt(dx * dx + dy * dy);
  const clamp = Math.min(dist, RANGE);
  const angle = Math.atan2(dy, dx);
  hintKnobEl.style.left    = (ox + Math.cos(angle) * clamp) + 'px';
  hintKnobEl.style.top     = (oy + Math.sin(angle) * clamp) + 'px';
  hintKnobEl.style.opacity = '1';
}

function hideHint() {
  if (!hintEl) return;
  hideTimer = setTimeout(() => {
    hintEl.style.opacity     = '0';
    hintKnobEl.style.opacity = '0';
  }, 80);
}

// ── joystick ─────────────────────────────────────────────────────────────────
function clearDirectional() {
  input.left = input.right = input.boost = input.down = false;
}

function applyDelta(dx, dy) {
  input.left  = dx < -DEAD;
  input.right = dx >  DEAD;
  input.boost = dy < -DEAD;
  input.down  = dy >  DEAD;
}

function onTouchStart(e) {
  if (!state.gameRunning || state.crashed || touchId !== null) return;
  const t = e.changedTouches[0];
  touchId = t.identifier;
  originX = t.clientX;
  originY = t.clientY;
  showHint(originX, originY, t.clientX, t.clientY);
}

function onTouchMove(e) {
  if (touchId === null) return;
  e.preventDefault();
  let touch = null;
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === touchId) { touch = e.touches[i]; break; }
  }
  if (!touch) return;
  applyDelta(touch.clientX - originX, touch.clientY - originY);
  showHint(originX, originY, touch.clientX, touch.clientY);
}

function onTouchEnd(e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier !== touchId) continue;
    touchId = null;
    clearDirectional();
    hideHint();
    break;
  }
}

// ── jump button ───────────────────────────────────────────────────────────────
function wireJumpButton() {
  const btn = document.getElementById('jump-btn');
  if (!btn) return;

  btn.addEventListener('touchstart', e => {
    e.stopPropagation();
    if (!state.gameRunning || state.crashed) return;
    input.jumpHeld     = true;
    input.jumpReleased = false;
  }, { passive: true });

  btn.addEventListener('touchend', e => {
    e.stopPropagation();
    if (input.jumpHeld) input.jumpReleased = true;
    input.jumpHeld = false;
  }, { passive: true });

  btn.addEventListener('touchcancel', () => {
    input.jumpHeld = false;
  }, { passive: true });
}

// ── init ──────────────────────────────────────────────────────────────────────
export function setupTouchInput() {
  if (!('ontouchstart' in window) && navigator.maxTouchPoints < 1) return;

  const pad = document.getElementById('touch-pad');
  if (!pad) return;

  const { ring, knob } = createHint();
  hintEl     = ring;
  hintKnobEl = knob;

  pad.addEventListener('touchstart',  onTouchStart, { passive: true });
  pad.addEventListener('touchmove',   onTouchMove,  { passive: false });
  pad.addEventListener('touchend',    onTouchEnd,   { passive: true });
  pad.addEventListener('touchcancel', onTouchEnd,   { passive: true });

  wireJumpButton();
}


