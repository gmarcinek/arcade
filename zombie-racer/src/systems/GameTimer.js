import { STARTING_TIME } from '../constants.js';

export class GameTimer {
  constructor() {
    this.current = STARTING_TIME;
    this.running = false;
    this.onGameOver = null;
  }

  start() { this.running = true; }
  stop()  { this.running = false; }
  reset() { this.current = STARTING_TIME; this.running = false; }

  addTime(seconds) {
    this.current += seconds;
  }

  update(dt) {
    if (!this.running) return;
    this.current -= dt;
    if (this.current <= 0) {
      this.current = 0;
      this.running = false;
      if (this.onGameOver) this.onGameOver();
    }
  }

  getDisplay() {
    const t = Math.max(0, this.current);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
