export class HUD {
  constructor() {
    this._el = document.getElementById('hud');
    this._el.innerHTML = `
      <div id="hud-timer" style="font-size:52px;font-weight:900;color:#fff;text-shadow:0 2px 8px #000;text-align:center;letter-spacing:2px;"></div>
      <div id="hud-kills" style="font-size:18px;color:#ffcc00;text-shadow:0 1px 4px #000;margin-top:4px;"></div>
      <div id="hud-credits" style="font-size:22px;font-weight:900;color:#00ffcc;text-shadow:0 1px 6px #000;margin-top:2px;"></div>
      <div id="hud-hp" style="margin-top:8px;">
        <div style="font-size:12px;color:#aaa;margin-bottom:2px;">AUTO HP &nbsp;<span style="color:#666;">[Backspace = lecz -50cr]</span></div>
        <div style="width:180px;height:12px;background:#333;border-radius:6px;overflow:hidden;">
          <div id="hud-hp-bar" style="height:100%;width:100%;background:#22cc44;transition:width .2s,background .2s;border-radius:6px;"></div>
        </div>
      </div>
      <div id="hud-speed" style="position:absolute;bottom:24px;right:32px;font-size:38px;font-weight:900;color:#fff;text-shadow:0 2px 10px #000;text-align:right;letter-spacing:1px;"></div>
    `;
    this._timer   = document.getElementById('hud-timer');
    this._kills   = document.getElementById('hud-kills');
    this._credits = document.getElementById('hud-credits');
    this._hpBar   = document.getElementById('hud-hp-bar');
    this._speed   = document.getElementById('hud-speed');
  }

  update(timerDisplay, zombieKills, carKills, hpPercent, credits = 0, speedKmh = 0) {
    this._timer.textContent   = timerDisplay;
    this._kills.textContent   = `🧟 ×${zombieKills}   🚗 ×${carKills}`;
    this._credits.textContent = `💰 ${credits >= 0 ? '+' : ''}${credits} CR`;
    this._credits.style.color = credits >= 0 ? '#00ffcc' : '#ff6666';
    const pct = Math.max(0, Math.min(100, hpPercent));
    this._hpBar.style.width      = pct + '%';
    this._hpBar.style.background = pct > 50 ? '#22cc44' : pct > 25 ? '#ffaa00' : '#ff3333';
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
