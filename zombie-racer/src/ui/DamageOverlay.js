import { PARTS } from '../car/DamageSystem.js';

export class DamageOverlay {
  constructor() {
    this._container = document.createElement('div');
    this._container.style.cssText = `
      position:absolute;bottom:20px;right:20px;width:120px;height:160px;
      background:rgba(0,0,0,0.6);border-radius:8px;padding:8px;
      display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(5,1fr);
      gap:3px;font-size:9px;color:#fff;font-family:monospace;
    `;

    this._parts = {};
    const layout = [
      ['FL',    1, 1, PARTS.WHEEL_FL],
      ['FRONT', 2, 1, PARTS.BUMPER_FRONT],
      ['FR',    3, 1, PARTS.WHEEL_FR],
      ['L',     1, 3, PARTS.SIDE_LEFT],
      ['ENG',   2, 3, PARTS.ENGINE],
      ['R',     3, 3, PARTS.SIDE_RIGHT],
      ['RL',    1, 5, PARTS.WHEEL_RL],
      ['REAR',  2, 5, PARTS.BUMPER_REAR],
      ['RR',    3, 5, PARTS.WHEEL_RR],
    ];

    for (const [label, col, row, key] of layout) {
      const el = document.createElement('div');
      el.style.cssText = `
        grid-column:${col};grid-row:${row};background:#22cc44;
        border-radius:3px;display:flex;align-items:center;
        justify-content:center;font-size:8px;font-weight:bold;
        transition:background .3s;
      `;
      el.textContent = label;
      this._container.appendChild(el);
      this._parts[key] = el;
    }

    document.getElementById('hud').appendChild(this._container);
  }

  update(damageState) {
    for (const [key, el] of Object.entries(this._parts)) {
      const dmg = damageState[key] || 0;
      const r = Math.floor(dmg * 255);
      const g = Math.floor((1 - dmg) * 200);
      el.style.background = `rgb(${r},${g},0)`;
    }
  }
}
