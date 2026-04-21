import { WORLD_SIZE } from '../constants.js';

const MAP_HALF  = WORLD_SIZE * 0.5;
const SIZE      = 160;  // px — rozmiar canvasu
const PADDING   = 8;    // px — margines wewnętrzny

export class Minimap {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._canvas.width  = SIZE;
    this._canvas.height = SIZE;
    // setProperty z 'important' — nadpisuje globalne 'canvas { top:0; left:0 }' z index.html
    const s = this._canvas.style;
    s.setProperty('position',       'fixed',                         'important');
    s.setProperty('bottom',         '24px',                          'important');
    s.setProperty('left',           '24px',                          'important');
    s.setProperty('top',            'auto',                          'important');
    s.setProperty('width',          SIZE + 'px',                     'important');
    s.setProperty('height',         SIZE + 'px',                     'important');
    s.setProperty('border-radius',  '6px',                           'important');
    s.setProperty('border',         '2px solid rgba(255,255,255,0.25)', 'important');
    s.setProperty('background',     'rgba(0,0,0,0.55)',               'important');
    s.setProperty('z-index',        '999',                           'important');
    s.setProperty('pointer-events', 'none',                          'important');
    document.body.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
  }

  /** Przelicz współrzędną świata na piksel canvasu */
  _toCanvas(worldX, worldZ) {
    const inner = SIZE - PADDING * 2;
    const px = PADDING + ((worldX + MAP_HALF) / (MAP_HALF * 2)) * inner;
    const py = PADDING + ((worldZ + MAP_HALF) / (MAP_HALF * 2)) * inner;
    return [px, py];
  }

  /**
   * @param {{ x, z }} playerPos
   * @param {number} playerYaw yaw w radianach, 0 = przód mapy (+Z)
   * @param {Array<{ chassisBody: { position: { x, z } }, isAlive: boolean }>} npcs
   */
  update(playerPos, playerYaw, npcs) {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Siatka referencyjna
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 0.5;
    for (let i = 1; i < 4; i++) {
      const s = (SIZE / 4) * i;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(SIZE, s); ctx.stroke();
    }

    // NPC — czerwone kropki
    for (const npc of npcs) {
      if (!npc.isAlive || !npc.chassisBody) continue;
      const [px, pz] = this._toCanvas(
        npc.chassisBody.position.x,
        npc.chassisBody.position.z
      );
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3333';
      ctx.fill();
    }

    // Gracz — biały trójkąt
    if (playerPos) {
      const [px, pz] = this._toCanvas(playerPos.x, playerPos.z);
      const yaw = playerYaw ?? 0;
      const tipX = Math.sin(yaw) * 7;
      const tipY = -Math.cos(yaw) * 7;
      const leftX = Math.sin(yaw - 2.45) * 6.5;
      const leftY = -Math.cos(yaw - 2.45) * 6.5;
      const rightX = Math.sin(yaw + 2.45) * 6.5;
      const rightY = -Math.cos(yaw + 2.45) * 6.5;
      ctx.beginPath();
      ctx.moveTo(px + tipX, pz + tipY);
      ctx.lineTo(px + leftX, pz + leftY);
      ctx.lineTo(px + rightX, pz + rightY);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  destroy() {
    this._canvas.remove();
  }
}
