export class TouchInput {
  constructor() {
    this.throttle = 0;
    this.steer = 0;
    this.brake = false;

    this._driveTouchId = null;
    this._brakeTouchId = null;
    this._boostTouchId = null;
    this._healQueue = 0;
    this._insertQueue = 0;
    this._homeQueue = 0;
    this._joystickCenter = { x: 0, y: 0 };
    this._joystickRadius = 54;
    this._steerDeadzone = 0.14;
    this._throttleDeadzone = 0.18;
    this._steerExponent = 1.9;
    this._throttleExponent = 2.2;

    this._buildUI();
  }

  _buildUI() {
    const container = document.getElementById('mobileControls');
    container.style.pointerEvents = 'none';
    container.innerHTML = `
      <div id="topActions" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:none;">
        <div id="healBtn" style="min-width:68px;height:34px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,140,170,0.44);
          background:rgba(140,20,60,0.24);display:flex;align-items:center;justify-content:center;color:#fff;
          font:800 11px/1 system-ui,sans-serif;letter-spacing:1px;pointer-events:auto;touch-action:manipulation;user-select:none;">
          LECZ
        </div>
        <div id="insertBtn" style="min-width:76px;height:34px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,210,120,0.45);
          background:rgba(255,170,0,0.22);display:flex;align-items:center;justify-content:center;color:#fff;
          font:800 11px/1 system-ui,sans-serif;letter-spacing:1px;pointer-events:auto;touch-action:manipulation;user-select:none;">
          NA KOLA
        </div>
      </div>
      <div id="orientationHint" style="position:absolute;top:62px;left:50%;transform:translateX(-50%);
        padding:6px 12px;border-radius:999px;background:rgba(255,180,0,0.16);border:1px solid rgba(255,180,0,0.35);
        color:#ffd88a;font:700 11px/1 system-ui,sans-serif;letter-spacing:1px;pointer-events:none;">
        FULLSCREEN + POZIOM
      </div>
      <div id="boostBtn" style="position:absolute;left:10%;bottom:calc(10% + 78px);width:114px;height:68px;
        border-radius:16px;border:2px solid rgba(120,220,255,0.32);background:rgba(30,120,220,0.22);
        display:flex;align-items:center;justify-content:center;color:#fff;font:900 14px/1 system-ui,sans-serif;letter-spacing:2px;
        pointer-events:auto;touch-action:none;user-select:none;">
        BOOST
      </div>
      <div id="brakeBtn" style="position:absolute;left:10%;bottom:10%;width:114px;height:68px;
        border-radius:16px;border:2px solid rgba(255,120,120,0.32);background:rgba(255,40,40,0.24);
        display:flex;align-items:center;justify-content:center;color:#fff;font:900 14px/1 system-ui,sans-serif;letter-spacing:2px;
        pointer-events:auto;touch-action:none;user-select:none;">
        BREAK
      </div>
      <div id="joystickZone" style="position:absolute;right:10%;bottom:10%;width:152px;height:152px;
        border-radius:50%;border:2px solid rgba(120,255,200,0.28);background:radial-gradient(circle at 50% 50%, rgba(60,220,180,0.28), rgba(6,38,34,0.2) 62%, rgba(0,0,0,0.1) 100%);
        box-shadow:0 0 0 12px rgba(255,255,255,0.03) inset;pointer-events:auto;touch-action:none;user-select:none;">
        <div style="position:absolute;left:50%;top:12px;transform:translateX(-50%);color:#e7fff9;font:900 14px/1 system-ui,sans-serif;letter-spacing:2px;">
          FRONT
        </div>
        <div style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#dffaf5;font:900 13px/1 system-ui,sans-serif;letter-spacing:1px;">
          LEFT
        </div>
        <div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#dffaf5;font:900 13px/1 system-ui,sans-serif;letter-spacing:1px;">
          RIGHT
        </div>
        <div style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);color:#ffe0cc;font:900 14px/1 system-ui,sans-serif;letter-spacing:2px;">
          BACK
        </div>
        <div id="joystickKnob" style="position:absolute;left:50%;top:50%;width:62px;height:62px;transform:translate(-50%,-50%);
          border-radius:50%;border:2px solid rgba(255,255,255,0.4);background:radial-gradient(circle at 35% 30%, rgba(255,255,255,0.8), rgba(120,255,210,0.35));
          box-shadow:0 10px 24px rgba(0,0,0,0.28);"></div>
      </div>
      <div id="homeBtn" style="position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:80px;height:34px;
        border-radius:12px;border:1px solid rgba(150,220,255,0.45);background:rgba(30,120,220,0.22);
        display:flex;align-items:center;justify-content:center;color:#fff;font:800 11px/1 system-ui,sans-serif;letter-spacing:1px;
        pointer-events:auto;touch-action:manipulation;user-select:none;">
        START
      </div>
    `;
    container.style.display = 'block';

    const healBtn = document.getElementById('healBtn');
    const boostBtn = document.getElementById('boostBtn');
    const brakeBtn = document.getElementById('brakeBtn');
    const joystickZone = document.getElementById('joystickZone');
    const joystickKnob = document.getElementById('joystickKnob');
    const insertBtn = document.getElementById('insertBtn');
    const homeBtn = document.getElementById('homeBtn');

    const updatePedalState = () => {
      this.brake = this._brakeTouchId !== null;
    };

    const resetJoystick = () => {
      this._driveTouchId = null;
      this.throttle = 0;
      this.steer = 0;
      joystickKnob.style.left = '50%';
      joystickKnob.style.top = '50%';
    };

    const updateJoystickCenter = () => {
      const rect = joystickZone.getBoundingClientRect();
      this._joystickCenter = {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5
      };
      this._joystickRadius = rect.width * 0.36;
    };

    const updateJoystick = touch => {
      const dx = touch.clientX - this._joystickCenter.x;
      const dy = touch.clientY - this._joystickCenter.y;
      const distance = Math.hypot(dx, dy);
      const clampedDistance = Math.min(distance, this._joystickRadius);
      const angle = Math.atan2(dy, dx);
      const clampedX = Math.cos(angle) * clampedDistance;
      const clampedY = Math.sin(angle) * clampedDistance;
      const normalizedX = this._joystickRadius > 0 ? clampedX / this._joystickRadius : 0;
      const normalizedY = this._joystickRadius > 0 ? clampedY / this._joystickRadius : 0;

      joystickKnob.style.left = `${50 + normalizedX * 32}%`;
      joystickKnob.style.top = `${50 + normalizedY * 32}%`;
      this.steer = this._applyResponseCurve(normalizedX, this._steerDeadzone, this._steerExponent);
      this.throttle = this._applyResponseCurve(-normalizedY, this._throttleDeadzone, this._throttleExponent);
    };

    joystickZone.addEventListener('touchstart', event => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (!touch) return;
      updateJoystickCenter();
      this._driveTouchId = touch.identifier;
      updateJoystick(touch);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._driveTouchId) updateJoystick(touch);
      }
    }, { passive: false });

    joystickZone.addEventListener('touchend', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._driveTouchId) resetJoystick();
      }
    }, { passive: false });

    joystickZone.addEventListener('touchcancel', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._driveTouchId) resetJoystick();
      }
    }, { passive: false });

    boostBtn.addEventListener('touchstart', event => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) {
        this._boostTouchId = touch.identifier;
      }
    }, { passive: false });

    boostBtn.addEventListener('touchend', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._boostTouchId) {
          this._boostTouchId = null;
        }
      }
    }, { passive: false });

    boostBtn.addEventListener('touchcancel', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._boostTouchId) {
          this._boostTouchId = null;
        }
      }
    }, { passive: false });

    brakeBtn.addEventListener('touchstart', event => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) {
        this._brakeTouchId = touch.identifier;
        updatePedalState();
      }
    }, { passive: false });

    brakeBtn.addEventListener('touchend', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._brakeTouchId) {
          this._brakeTouchId = null;
          updatePedalState();
        }
      }
    }, { passive: false });

    brakeBtn.addEventListener('touchcancel', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._brakeTouchId) {
          this._brakeTouchId = null;
          updatePedalState();
        }
      }
    }, { passive: false });

    const queueAction = key => event => {
      event.preventDefault();
      if (key === 'heal') this._healQueue += 1;
      if (key === 'insert') this._insertQueue += 1;
      if (key === 'home') this._homeQueue += 1;
    };

    healBtn.addEventListener('touchstart', queueAction('heal'), { passive: false });
    insertBtn.addEventListener('touchstart', queueAction('insert'), { passive: false });
    homeBtn.addEventListener('touchstart', queueAction('home'), { passive: false });
  }

  _applyResponseCurve(value, deadzone, exponent) {
    const clamped = Math.max(-1, Math.min(1, value));
    const magnitude = Math.abs(clamped);
    if (magnitude <= deadzone) return 0;

    const normalized = (magnitude - deadzone) / (1 - deadzone);
    const curved = Math.pow(normalized, exponent);
    return Math.sign(clamped) * curved;
  }

  get boost() { return this._boostTouchId !== null; }

  consumeHeal() {
    if (this._healQueue > 0) {
      this._healQueue -= 1;
      return true;
    }
    return false;
  }

  get homePressed() {
    if (this._homeQueue > 0) {
      this._homeQueue -= 1;
      return true;
    }
    return false;
  }

  get insertPressed() {
    if (this._insertQueue > 0) {
      this._insertQueue -= 1;
      return true;
    }
    return false;
  }
}
