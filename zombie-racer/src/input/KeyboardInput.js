export class KeyboardInput {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', e => { this.keys.add(e.code); e.preventDefault(); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
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

  get healPressed() {
    return this.keys.has('Backspace');
  }

  get homePressed() {
    return this.keys.has('Home');
  }
}
