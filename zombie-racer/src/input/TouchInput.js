export class TouchInput {
  constructor() {
    this.throttle = 0;
    this.steer = 0;
    this.brake = false;

    this._joystickActive = false;
    this._joystickCenter = { x: 0, y: 0 };

    this._buildUI();
  }

  _buildUI() {
    const container = document.getElementById('mobileControls');
    container.style.pointerEvents = 'none';
    container.innerHTML = `
      <div id="joystickZone" style="position:absolute;bottom:30px;left:30px;width:120px;height:120px;
        background:rgba(255,255,255,0.15);border-radius:50%;border:2px solid rgba(255,255,255,0.3);
        pointer-events:auto;touch-action:none;">
        <div id="joystickKnob" style="position:absolute;top:50%;left:50%;width:50px;height:50px;
          transform:translate(-50%,-50%);background:rgba(255,255,255,0.5);border-radius:50%;"></div>
      </div>
      <div id="brakeBtn" style="position:absolute;bottom:50px;right:40px;width:80px;height:80px;
        background:rgba(255,50,50,0.4);border-radius:50%;border:2px solid rgba(255,100,100,0.6);
        display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px;
        pointer-events:auto;touch-action:none;">
        HAMUL
      </div>
      <div id="gasBtn" style="position:absolute;bottom:150px;right:40px;width:80px;height:80px;
        background:rgba(50,255,50,0.4);border-radius:50%;border:2px solid rgba(100,255,100,0.6);
        display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px;
        pointer-events:auto;touch-action:none;">
        GAS
      </div>
    `;
    container.style.display = 'block';

    const zone = document.getElementById('joystickZone');
    const knob = document.getElementById('joystickKnob');
    const brakeBtn = document.getElementById('brakeBtn');
    const gasBtn = document.getElementById('gasBtn');

    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      const r = zone.getBoundingClientRect();
      this._joystickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this._joystickActive = true;
    }, { passive: false });

    zone.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!this._joystickActive) return;
      const t = e.touches[0];
      const dx = t.clientX - this._joystickCenter.x;
      const dy = t.clientY - this._joystickCenter.y;
      const maxR = 45;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * clamped / maxR;
      const ny = Math.sin(angle) * clamped / maxR;

      knob.style.left = (50 + nx * 40) + '%';
      knob.style.top  = (50 + ny * 40) + '%';

      this.steer    = nx;
      this.throttle = -ny;
    }, { passive: false });

    zone.addEventListener('touchend', e => {
      e.preventDefault();
      this._joystickActive = false;
      this.steer    = 0;
      this.throttle = 0;
      knob.style.left = '50%';
      knob.style.top  = '50%';
    }, { passive: false });

    brakeBtn.addEventListener('touchstart', e => { e.preventDefault(); this.brake = true;  }, { passive: false });
    brakeBtn.addEventListener('touchend',   e => { e.preventDefault(); this.brake = false; }, { passive: false });

    gasBtn.addEventListener('touchstart', e => { e.preventDefault(); this.throttle = 1; }, { passive: false });
    gasBtn.addEventListener('touchend',   e => { e.preventDefault(); this.throttle = 0; }, { passive: false });
  }
}
