export class AudioManager {
  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.enabled = true;
    } catch (e) {
      this.enabled = false;
    }
    this._engineSource = null;
    this._engineGain = null;
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startEngine(speed, maxSpeed) {
    if (!this.enabled) return;
    this.stopEngine();
    const osc = this.ctx.createOscillator();
    this._engineGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 80 + (speed / maxSpeed) * 200;
    this._engineGain.gain.value = 0.15;
    osc.connect(this._engineGain);
    this._engineGain.connect(this.masterGain);
    osc.start();
    this._engineSource = osc;
  }

  updateEngine(speed, maxSpeed) {
    if (!this.enabled || !this._engineSource) return;
    const freq = 80 + (speed / maxSpeed) * 200;
    this._engineSource.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }

  stopEngine() {
    if (this._engineSource) {
      try { this._engineSource.stop(); } catch (_) {}
      this._engineSource = null;
    }
  }

  crash(intensity = 1.0) {
    if (!this.enabled) return;
    const bufSize = this.ctx.sampleRate * 0.3;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * intensity;
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  explode() {
    if (!this.enabled) return;
    const bufSize = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / bufSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5);
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  pickup() {
    if (!this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
