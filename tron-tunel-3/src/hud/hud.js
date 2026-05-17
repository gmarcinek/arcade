import { state } from '../state.js';
import { OUT_OF_BOUNDS_KILL_S, CFG } from '../config.js';

const flashEl  = document.getElementById('flash');
const dangerEl = document.getElementById('danger-warn');
const overlay  = document.getElementById('overlay');
const fpsEl    = document.getElementById('fps-counter');

// FPS tracking — rolling average over last 60 samples
const _fpsBuf = new Float32Array(60);
let _fpsIdx = 0, _fpsReady = false;

export function updateFPS(dt) {
  if (dt <= 0) return;
  _fpsBuf[_fpsIdx] = 1 / dt;
  _fpsIdx = (_fpsIdx + 1) % 60;
  if (_fpsIdx === 0) _fpsReady = true;
  const n = _fpsReady ? 60 : _fpsIdx;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += _fpsBuf[i];
  fpsEl.textContent = Math.round(sum / n) + ' fps';
}

let trickHide = null;

export function showTrick(name) {
  document.getElementById('trick-name').textContent = name;
  document.getElementById('trick-pts').textContent  = '';
  const el = document.getElementById('trick-display');
  el.style.opacity = '1';
  if (trickHide) clearTimeout(trickHide);
  trickHide = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

const boostSegs      = [0, 1, 2, 3].map(i => document.getElementById('bseg-' + i));
const jumpChargeHud  = document.getElementById('jump-charge-hud');
const jumpChargeFill = document.getElementById('jump-charge-fill');
const jumpChargePct  = document.getElementById('jump-charge-pct');

export function updateHUD() {
  document.getElementById('score').textContent = Math.floor(state.score).toLocaleString();
  const _elapsed = state.timeElapsed ?? 0;
  const m = Math.floor(_elapsed / 60);
  const s = Math.floor(_elapsed % 60);
  document.getElementById('time').textContent  = m + ':' + (s < 10 ? '0' : '') + s;
  document.getElementById('speed').textContent = Math.floor(state.speed * 3.6);
  document.getElementById('dist').textContent  = Math.floor(state.totalDistance) + ' m';

  const lit = Math.ceil(state.boost * 4);
  boostSegs.forEach((seg, i) => {
    const on = i < lit;
    if (on && !seg.classList.contains('on')) {
      seg.classList.add('on');
      seg.classList.remove('pulse');
      void seg.offsetWidth;
      seg.classList.add('pulse');
    } else if (!on) {
      seg.classList.remove('on', 'pulse');
    }
  });

  const charging = state.jumpChargeTime > 0 && state.jumpCooldown <= 0;
  if (charging) {
    jumpChargeHud.style.display = 'flex';
    const t   = Math.min(state.jumpChargeTime / CFG.jumpChargeTime, 1.0);
    const pwr = Math.round((CFG.jumpMinFactor + (CFG.jumpMaxFactor - CFG.jumpMinFactor) * t) * 100);
    jumpChargeFill.style.width = (t * 100) + '%';
    jumpChargePct.textContent  = pwr + '%';
    if (t >= 1.0) {
      jumpChargeFill.classList.add('full');
    } else {
      jumpChargeFill.classList.remove('full');
    }
  } else {
    jumpChargeHud.style.display = 'none';
    jumpChargeFill.classList.remove('full');
  }
}

export function applyFlash(dt) {
  state.flashAlpha = Math.max(0, state.flashAlpha - dt * 2.2);
  flashEl.style.background = state.flashAlpha > 0
    ? 'rgba(224, 32, 64, ' + (state.flashAlpha * 0.5).toFixed(3) + ')'
    : 'transparent';
}

export function applyDanger() {
  if (state.dangerTimer > 0 && state.gameRunning) {
    dangerEl.style.display = 'flex';
    const remaining = Math.max(0, OUT_OF_BOUNDS_KILL_S - state.dangerTimer).toFixed(1);
    dangerEl.textContent = '' + remaining + 's';
    const intensity = Math.min(1, state.dangerTimer / OUT_OF_BOUNDS_KILL_S);
    dangerEl.style.opacity = String(0.7 + 0.3 * Math.sin(Date.now() / (120 - 80 * intensity)));
  } else {
    dangerEl.style.display = 'none';
  }
}

export function endGame(fell, onRestart) {
  state.gameRunning = false;
  const reason = fell ? 'WYPADŁEŚ Z CZARNEJ DZIURY' : 'koniec czasu';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="end-card">
      <div class="end-label">${reason}</div>
      <div class="end-score">${Math.floor(state.score).toLocaleString()}</div>
      <div class="end-stat">${Math.floor(state.totalDistance)} m</div>
      <button class="btn" id="restart-btn" style="margin-top: 14px;">zagraj jeszcze</button>
    </div>
  `;
  const btn = document.getElementById('restart-btn');
  btn.disabled = true;
  let countdown = 2;
  btn.textContent = 'zagraj jeszcze (' + countdown + ')';
  const iv = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(iv);
      btn.disabled = false;
      btn.textContent = 'zagraj jeszcze';
    } else {
      btn.textContent = 'zagraj jeszcze (' + countdown + ')';
    }
  }, 1000);
  btn.addEventListener('click', onRestart);
}

const respawnOverlayEl = document.getElementById('respawn-overlay');
let _respawnIv = null;

export function showRespawnCountdown(totalSeconds) {
  if (_respawnIv) clearInterval(_respawnIv);
  respawnOverlayEl.classList.add('active');

  let remaining = Math.ceil(totalSeconds);
  _setRespawnNum(remaining);

  _respawnIv = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_respawnIv);
      _respawnIv = null;
      respawnOverlayEl.innerHTML = '<span class="respawn-bum">LOOSER</span>';
      setTimeout(() => {
        respawnOverlayEl.classList.remove('active');
        respawnOverlayEl.innerHTML = '';
      }, 600);
    } else {
      _setRespawnNum(remaining);
    }
  }, 1000);
}

function _setRespawnNum(n) {
  respawnOverlayEl.innerHTML =
    '<span class="respawn-label">respawn</span>' +
    '<span class="respawn-num">' + n + '</span>';
}
