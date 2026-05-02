import { state } from './state.js';
import { DANGER_TIMEOUT } from './config.js';

const flashEl  = document.getElementById('flash');
const dangerEl = document.getElementById('danger-warn');
const overlay  = document.getElementById('overlay');

let trickHide = null;

export function showTrick(name) {
  document.getElementById('trick-name').textContent = name;
  document.getElementById('trick-pts').textContent  = '';
  const el = document.getElementById('trick-display');
  el.style.opacity = '1';
  if (trickHide) clearTimeout(trickHide);
  trickHide = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

export function updateHUD() {
  document.getElementById('score').textContent      = Math.floor(state.score).toLocaleString();
  const m = Math.floor(state.timeLeft / 60);
  const s = Math.floor(state.timeLeft % 60);
  document.getElementById('time').textContent       = m + ':' + (s < 10 ? '0' : '') + s;
  document.getElementById('speed').textContent      = Math.floor(state.speed * 3.6);
  document.getElementById('boost-fill').style.width = (state.boost * 100).toFixed(0) + '%';
  document.getElementById('dist').textContent       = Math.floor(state.totalDistance) + ' m';
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
    const remaining = (DANGER_TIMEOUT - state.dangerTimer).toFixed(1);
    dangerEl.textContent = '\u26a0 CZARNA STREFA! ' + remaining + 's';
    const intensity = state.dangerTimer / DANGER_TIMEOUT;
    dangerEl.style.opacity = String(0.7 + 0.3 * Math.sin(Date.now() / (120 - 80 * intensity)));
  } else {
    dangerEl.style.display = 'none';
  }
}

export function endGame(fell, onRestart) {
  state.gameRunning = false;
  const reason = fell ? 'WYPADŁEŚ Z TUNELU' : 'koniec czasu';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="end-card">
      <div class="end-label">${reason}</div>
      <div class="end-score">${Math.floor(state.score).toLocaleString()}</div>
      <div class="end-stat">${Math.floor(state.totalDistance)} m</div>
      <button class="btn" id="restart-btn" style="margin-top: 14px;">zagraj jeszcze</button>
    </div>
  `;
  document.getElementById('restart-btn').addEventListener('click', onRestart);
}
