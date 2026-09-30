export class KeyboardInput {
  constructor() {
    this.keys = new Set();
    this._healQueue = 0;
    this._gameKeys = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'Space', 'ShiftLeft', 'ShiftRight', 'Backspace', 'Home', 'Insert',
    ]);
    window.addEventListener('keydown', e => {
      if (this._isTextInput(e.target) || !this._gameKeys.has(e.code)) return;
      if (!e.repeat && e.code === 'Backspace') this._healQueue++;
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      if (this._gameKeys.has(e.code)) this.keys.delete(e.code);
    });
  }

  _isTextInput(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  get throttle() {
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) return 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) return -1;
    return 0;
  }

  get steer() {
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) return -1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) return 1;
    return 0;
  }

  get brake() {
    return this.keys.has('Space');
  }

  get boost() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeHeal() {
    if (this._healQueue > 0) { this._healQueue--; return true; }
    return false;
  }

  get healPressed() {
    return this.keys.has('Backspace');
  }

  get homePressed() {
    return this.keys.has('Home');
  }

  get insertPressed() {
    return this.keys.has('Insert');
  }
}
