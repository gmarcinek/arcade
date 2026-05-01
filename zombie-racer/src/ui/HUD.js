export class HUD {
  constructor() {
    this._el = document.getElementById('hud');
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) {
      this._el.style.transform = 'scale(0.3333)';
      this._el.style.transformOrigin = 'top left';
      this._el.style.width = '300%';
      this._el.style.height = '300%';
      this._el.style.padding = '8px 10px';
    }
    this._el.innerHTML = `
      <div id="hud-top-left" style="${isTouchDevice ? 'transform:scale(2);transform-origin:top left;width:max-content;' : ''}">
      <div id="hud-timer" style="font-size:52px;font-weight:900;color:#fff;text-shadow:0 2px 8px #000;text-align:center;letter-spacing:2px;"></div>
      <div id="hud-kills" style="font-size:18px;color:#ffcc00;text-shadow:0 1px 4px #000;margin-top:4px;"></div>
      <div id="hud-credits" style="font-size:22px;font-weight:900;color:#00ffcc;text-shadow:0 1px 6px #000;margin-top:2px;"></div>
      <div id="hud-hp" style="margin-top:8px;">
        <div id="hud-hp-label" style="font-size:${isTouchDevice ? '15px' : '12px'};font-weight:800;color:#ddd;margin-bottom:3px;">AUTO HP &nbsp;<span id="hud-hp-value" style="color:#ffffff;">100%</span> <span style="color:#666;">[LECZ / Backspace = -50cr]</span></div>
        <div style="width:${isTouchDevice ? '220px' : '180px'};height:${isTouchDevice ? '16px' : '12px'};background:#333;border-radius:6px;overflow:hidden;">
          <div id="hud-hp-bar" style="height:100%;width:100%;background:#22cc44;transition:width .2s,background .2s;border-radius:6px;"></div>
        </div>
      </div>
      <div id="hud-boost" style="margin-top:8px;">
        <div style="font-size:12px;color:#aaa;margin-bottom:2px;">BOOST &nbsp;<span style="color:#666;">[Shift]</span></div>
        <div style="width:180px;height:10px;background:#333;border-radius:5px;overflow:hidden;">
          <div id="hud-boost-bar" style="height:100%;width:100%;background:#00ccff;transition:background .1s;border-radius:5px;"></div>
        </div>
      </div>
      </div>
      <div id="hud-speed" style="position:absolute;bottom:24px;right:32px;font-size:38px;font-weight:900;color:#fff;text-shadow:0 2px 10px #000;text-align:right;letter-spacing:1px;"></div>
    `;
    this._timer     = document.getElementById('hud-timer');
    this._kills     = document.getElementById('hud-kills');
    this._credits   = document.getElementById('hud-credits');
    this._hpValue   = document.getElementById('hud-hp-value');
    this._hpBar     = document.getElementById('hud-hp-bar');
    this._boostBar  = document.getElementById('hud-boost-bar');
    this._speed     = document.getElementById('hud-speed');
  }

  update(timerDisplay, zombieKills, carKills, hpPercent, credits = 0, speedKmh = 0, boostFuel = 1, boostActive = false) {
    this._timer.textContent   = timerDisplay;
    this._kills.textContent   = `🧟 ×${zombieKills}   🚗 ×${carKills}`;
    this._credits.textContent = `💰 ${credits >= 0 ? '+' : ''}${credits} CR`;
    this._credits.style.color = credits >= 0 ? '#00ffcc' : '#ff6666';
    const pct = Math.max(0, Math.min(100, hpPercent));
    this._hpValue.textContent = `${Math.round(pct)}%`;
    this._hpBar.style.width      = pct + '%';
    this._hpBar.style.background = pct > 50 ? '#22cc44' : pct > 25 ? '#ffaa00' : '#ff3333';
    const bpct = Math.max(0, Math.min(100, boostFuel * 100));
    this._boostBar.style.width      = bpct + '%';
    this._boostBar.style.background = boostActive ? '#ffffff' : bpct > 50 ? '#00ccff' : bpct > 20 ? '#ffaa00' : '#ff4444';
    this._speed.textContent = `${Math.round(speedKmh)} km/h`;
  }

  showMessage(text, color = '#fff', duration = 2000) {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);
      font-size:36px;font-weight:900;color:${color};text-shadow:0 2px 12px #000;
      pointer-events:none;animation:fadeOut ${duration}ms forwards;`;
    this._el.appendChild(msg);
    setTimeout(() => msg.remove(), duration);
  }
}
