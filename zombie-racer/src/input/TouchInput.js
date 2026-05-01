export class TouchInput {
  constructor() {
    this.throttle = 0;
    this.steer = 0;
    this.brake = false;

    this._forwardTouchId = null;
    this._reverseTouchId = null;
    this._brakeTouchId = null;
    this._insertQueue = 0;
    this._homeQueue = 0;
    this._tiltBaseline = null;
    this._tiltEnabled = false;
    this._tiltPermissionRequired = typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
    this._tiltHandler = this._onDeviceOrientation.bind(this);

    this._buildUI();
    this._setupTilt();
  }

  _buildUI() {
    const container = document.getElementById('mobileControls');
    container.style.pointerEvents = 'none';
    container.innerHTML = `
      <div id="tiltStatus" style="position:absolute;top:18px;left:50%;transform:translateX(-50%);
        min-width:132px;padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);
        background:rgba(0,0,0,0.55);color:#d9fef5;font:700 12px/1 system-ui,sans-serif;letter-spacing:1px;
        text-align:center;pointer-events:auto;touch-action:manipulation;">
        ${this._tiltPermissionRequired ? 'WLACZ PRZECHYL' : 'PRZECHYL = SKRET'}
      </div>
      <div id="orientationHint" style="position:absolute;top:62px;left:50%;transform:translateX(-50%);
        padding:6px 12px;border-radius:999px;background:rgba(255,180,0,0.16);border:1px solid rgba(255,180,0,0.35);
        color:#ffd88a;font:700 11px/1 system-ui,sans-serif;letter-spacing:1px;pointer-events:none;">
        GRAJ W POZIOMIE
      </div>
      <div id="brakeZone" style="position:absolute;left:14px;top:22%;bottom:14px;width:30%;
        border-radius:24px;border:2px solid rgba(255,120,120,0.28);background:linear-gradient(180deg, rgba(255,90,90,0.12), rgba(255,40,40,0.28));
        display:flex;align-items:center;justify-content:center;color:#fff;font:900 20px/1 system-ui,sans-serif;letter-spacing:2px;
        pointer-events:auto;touch-action:none;user-select:none;">
        BRAKE
      </div>
      <div id="throttleZone" style="position:absolute;right:14px;top:22%;bottom:14px;width:30%;
        border-radius:24px;border:2px solid rgba(120,255,200,0.24);background:linear-gradient(180deg, rgba(50,255,180,0.2) 0%, rgba(0,120,80,0.12) 48%, rgba(255,150,70,0.12) 52%, rgba(255,110,0,0.24) 100%);
        pointer-events:auto;touch-action:none;user-select:none;overflow:hidden;">
        <div style="position:absolute;inset:0 0 50% 0;display:flex;align-items:center;justify-content:center;color:#e7fff9;font:900 18px/1 system-ui,sans-serif;letter-spacing:2px;">
          THROTTLE
        </div>
        <div style="position:absolute;left:14px;right:14px;top:50%;height:1px;background:rgba(255,255,255,0.2);"></div>
        <div style="position:absolute;inset:50% 0 0 0;display:flex;align-items:center;justify-content:center;color:#ffe0cc;font:900 18px/1 system-ui,sans-serif;letter-spacing:2px;">
          BACK
        </div>
      </div>
      <div id="insertBtn" style="position:absolute;right:calc(30% + 28px);bottom:18px;width:88px;height:52px;
        border-radius:16px;border:1px solid rgba(255,210,120,0.45);background:rgba(255,170,0,0.22);
        display:flex;align-items:center;justify-content:center;color:#fff;font:800 12px/1 system-ui,sans-serif;letter-spacing:1px;
        pointer-events:auto;touch-action:manipulation;user-select:none;">
        NA KOLA
      </div>
      <div id="homeBtn" style="position:absolute;right:calc(30% + 28px);bottom:78px;width:88px;height:52px;
        border-radius:16px;border:1px solid rgba(150,220,255,0.45);background:rgba(30,120,220,0.22);
        display:flex;align-items:center;justify-content:center;color:#fff;font:800 12px/1 system-ui,sans-serif;letter-spacing:1px;
        pointer-events:auto;touch-action:manipulation;user-select:none;">
        START
      </div>
    `;
    container.style.display = 'block';

    const tiltStatus = document.getElementById('tiltStatus');
    const brakeZone = document.getElementById('brakeZone');
    const throttleZone = document.getElementById('throttleZone');
    const insertBtn = document.getElementById('insertBtn');
    const homeBtn = document.getElementById('homeBtn');

    const updateDriveState = () => {
      if (this._forwardTouchId !== null && this._reverseTouchId === null) {
        this.throttle = 1;
      } else if (this._reverseTouchId !== null && this._forwardTouchId === null) {
        this.throttle = -1;
      } else {
        this.throttle = 0;
      }
      this.brake = this._brakeTouchId !== null;
    };

    const setTouchSlot = (touchId, slot) => {
      if (slot === 'forward') this._forwardTouchId = touchId;
      if (slot === 'reverse') this._reverseTouchId = touchId;
      if (slot === 'brake') this._brakeTouchId = touchId;
      updateDriveState();
    };

    const clearTouchSlot = touchId => {
      if (this._forwardTouchId === touchId) this._forwardTouchId = null;
      if (this._reverseTouchId === touchId) this._reverseTouchId = null;
      if (this._brakeTouchId === touchId) this._brakeTouchId = null;
      updateDriveState();
    };

    const updateThrottleTouch = touch => {
      const rect = throttleZone.getBoundingClientRect();
      const zone = touch.clientY < rect.top + rect.height * 0.5 ? 'forward' : 'reverse';
      if (zone === 'forward') {
        if (this._reverseTouchId === touch.identifier) this._reverseTouchId = null;
        this._forwardTouchId = touch.identifier;
      } else {
        if (this._forwardTouchId === touch.identifier) this._forwardTouchId = null;
        this._reverseTouchId = touch.identifier;
      }
      updateDriveState();
    };

    throttleZone.addEventListener('touchstart', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) updateThrottleTouch(touch);
    }, { passive: false });

    throttleZone.addEventListener('touchmove', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        if (touch.identifier === this._forwardTouchId || touch.identifier === this._reverseTouchId) {
          updateThrottleTouch(touch);
        }
      }
    }, { passive: false });

    throttleZone.addEventListener('touchend', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) clearTouchSlot(touch.identifier);
    }, { passive: false });

    throttleZone.addEventListener('touchcancel', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) clearTouchSlot(touch.identifier);
    }, { passive: false });

    brakeZone.addEventListener('touchstart', event => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) setTouchSlot(touch.identifier, 'brake');
    }, { passive: false });

    brakeZone.addEventListener('touchend', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) clearTouchSlot(touch.identifier);
    }, { passive: false });

    brakeZone.addEventListener('touchcancel', event => {
      event.preventDefault();
      for (const touch of event.changedTouches) clearTouchSlot(touch.identifier);
    }, { passive: false });

    const queueAction = key => event => {
      event.preventDefault();
      if (key === 'insert') this._insertQueue += 1;
      if (key === 'home') this._homeQueue += 1;
    };

    insertBtn.addEventListener('touchstart', queueAction('insert'), { passive: false });
    homeBtn.addEventListener('touchstart', queueAction('home'), { passive: false });

    if (this._tiltPermissionRequired) {
      tiltStatus.addEventListener('click', async event => {
        event.preventDefault();
        try {
          const result = await DeviceOrientationEvent.requestPermission();
          if (result === 'granted') {
            this._enableTilt();
          } else {
            tiltStatus.textContent = 'PRZECHYL ZABLOKOWANY';
          }
        } catch {
          tiltStatus.textContent = 'BRAK DOSTEPU';
        }
      });
    }

    this._tiltStatus = tiltStatus;
  }

  _setupTilt() {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;
    if (!this._tiltPermissionRequired) this._enableTilt();
  }

  _enableTilt() {
    if (this._tiltEnabled) return;
    this._tiltEnabled = true;
    this._tiltBaseline = null;
    window.addEventListener('deviceorientation', this._tiltHandler);
    if (this._tiltStatus) this._tiltStatus.textContent = 'PRZECHYL = SKRET';
  }

  _getSteeringTilt(event) {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    if (Math.abs(angle) === 90 && typeof event.beta === 'number') {
      return angle > 0 ? -event.beta : event.beta;
    }
    if (typeof event.gamma === 'number') return event.gamma;
    return null;
  }

  _onDeviceOrientation(event) {
    const rawTilt = this._getSteeringTilt(event);
    if (rawTilt === null) return;
    if (this._tiltBaseline === null) this._tiltBaseline = rawTilt;
    const delta = rawTilt - this._tiltBaseline;
    const maxTilt = 22;
    const normalized = Math.max(-1, Math.min(1, delta / maxTilt));
    this.steer = normalized;
  }

  get boost() { return false; }

  consumeHeal() { return false; }

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
