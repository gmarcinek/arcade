// AudioAnalyzer — full analysis ported from handof/audio-visualizer-v3a.html
// Provides: band energy, spectral flux onset detection, bass-gated beat tracker,
// chroma vector, and smoothed composite values for shader uniforms.

export class AudioAnalyzer {
  constructor(audioCtx, sourceNode) {
    this._ctx = audioCtx;

    this._analyser = audioCtx.createAnalyser();
    this._analyser.fftSize = 4096;
    this._analyser.smoothingTimeConstant = 0.35;
    sourceNode.connect(this._analyser);
    // Do NOT connect to destination

    this._freqBuf = null;
    this._timeBuf = null;
    this._prevSpectrum = null;

    // Onset / beat state
    this._fluxHistory = [];
    this._beatTimes = [];
    this._lastBeatTime = 0;
    this._lastOnsetT = 0;
    this._bpm = 0;

    // Smoothed band values
    this._smSub = 0;
    this._smLow = 0;
    this._smMid = 0;
    this._smHigh = 0;
    this._smRms = 0;

    // Energy trend (crescendo / decrescendo)
    this._prevSmRms   = 0;
    this._energyRamp  = 0;  // smoothed rms derivative; >0 = rising, <0 = falling, range ≈ ±0.08

    // Transient tracking
    this._prevRawSub = 0;
    this._prevRawLow = 0;
    this._prevRawMid = 0;

    // Composite smoothed values
    this._bassImpact = 0;
    this._midWave = 0;
    this._lavaLight = 0;
    this._ribbonDrive = 0;
    this._beatPulse = 0;
    this._onsetPulse = 0;

    // Smoothed chroma tint (init to neutral warm-ish)
    this._chromaR = 0.55;
    this._chromaG = 0.20;
    this._chromaB = 0.50;
  }

  _smoothValue(prev, target, attack = 0.34, release = 0.10) {
    const a = target > prev ? attack : release;
    return prev * (1 - a) + target * a;
  }

  // RMS + peak hybrid band energy with soft compression (pow 0.72)
  _bandEnergy(buffer, binHz, fromHz, toHz, gain = 1.0) {
    const i0 = Math.max(1, Math.floor(fromHz / binHz));
    const i1 = Math.min(buffer.length - 1, Math.ceil(toHz / binHz));
    if (i1 <= i0) return 0;

    let sumSq = 0;
    let sum = 0;
    let peak = 0;
    let n = 0;

    for (let i = i0; i <= i1; i++) {
      const v = buffer[i] / 255;
      sum += v;
      sumSq += v * v;
      if (v > peak) peak = v;
      n++;
    }

    const avg = sum / Math.max(1, n);
    const rms = Math.sqrt(sumSq / Math.max(1, n));
    const hybrid = rms * 0.62 + avg * 0.18 + peak * 0.20;

    // Soft compression: quieter music becomes visible, loud music does not clip
    return Math.min(1.8, Math.pow(hybrid * gain, 0.72));
  }

  analyzeFrame(dt) {
    const analyser = this._analyser;

    if (!this._freqBuf || this._freqBuf.length !== analyser.frequencyBinCount) {
      this._freqBuf = new Uint8Array(analyser.frequencyBinCount);
      this._timeBuf = new Uint8Array(analyser.fftSize);
    }

    analyser.getByteFrequencyData(this._freqBuf);
    analyser.getByteTimeDomainData(this._timeBuf);

    const sr = this._ctx.sampleRate;
    const binHz = sr / analyser.fftSize;
    const freqBuf = this._freqBuf;
    const timeBuf = this._timeBuf;

    // Band energies — split low-end into sub/bass, use musical log-ish ranges
    const subRaw    = this._bandEnergy(freqBuf, binHz, 24,    60);
    const bassRaw   = this._bandEnergy(freqBuf, binHz, 60,    180);
    const lowMidRaw = this._bandEnergy(freqBuf, binHz, 180,   420, 0.9);
    const midRaw    = this._bandEnergy(freqBuf, binHz, 420,   2400);
    const highRaw   = this._bandEnergy(freqBuf, binHz, 2400,  9000);
    const airRaw    = this._bandEnergy(freqBuf, binHz, 9000,  16000, 0.75);

    // RMS from time domain
    let rms = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const s = (timeBuf[i] - 128) / 128;
      rms += s * s;
    }
    rms = Math.sqrt(rms / timeBuf.length);

    // Chroma: 12 pitch classes → smoothed RGB colour drift
    const A4 = 440;
    let cR = 0, cG = 0, cB = 0, cTot = 0;
    for (let i = 1; i < freqBuf.length; i++) {
      const hz = i * binHz;
      const v = freqBuf[i] / 255;
      if (hz > 80 && hz < 5000) {
        const midi = 12 * Math.log2(hz / A4) + 69;
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        const w = v * v;
        const h = pc / 12;
        cTot += w;
        cR += w * (0.5 + 0.5 * Math.cos(2 * Math.PI * h));
        cG += w * (0.5 + 0.5 * Math.cos(2 * Math.PI * h - 2.094));
        cB += w * (0.5 + 0.5 * Math.cos(2 * Math.PI * h - 4.188));
      }
    }
    if (cTot > 0.0001) { cR /= cTot; cG /= cTot; cB /= cTot; }

    // Spectral flux split by range: onset detection + bass kick detection
    let flux = 0, lowFlux = 0, midFlux = 0;
    if (this._prevSpectrum) {
      for (let i = 1; i < freqBuf.length; i++) {
        const d = freqBuf[i] - this._prevSpectrum[i];
        if (d <= 0) continue;
        flux += d;
        const hz = i * binHz;
        if (hz < 180) lowFlux += d;
        else if (hz < 2400) midFlux += d;
      }
    }
    if (!this._prevSpectrum) this._prevSpectrum = new Uint8Array(freqBuf.length);
    this._prevSpectrum.set(freqBuf);

    // Adaptive flux threshold: mean + std * 1.35 (56-frame window)
    this._fluxHistory.push(flux);
    if (this._fluxHistory.length > 56) this._fluxHistory.shift();

    let mean = 0;
    for (let i = 0; i < this._fluxHistory.length; i++) mean += this._fluxHistory[i];
    mean /= Math.max(1, this._fluxHistory.length);

    let variance = 0;
    for (let i = 0; i < this._fluxHistory.length; i++) {
      const d = this._fluxHistory[i] - mean;
      variance += d * d;
    }
    variance /= Math.max(1, this._fluxHistory.length);
    const std = Math.sqrt(variance);

    const now = this._ctx.currentTime;
    const lowTransient = Math.max(0, (subRaw + bassRaw) - (this._prevRawSub + this._prevRawLow) * 0.5);
    const midTransient = Math.max(0, midRaw - this._prevRawMid);  // kept for completeness
    void midTransient;
    this._prevRawSub = subRaw;
    this._prevRawLow = bassRaw;
    this._prevRawMid = midRaw;

    let isOnset = false;
    const adaptiveFlux = mean + std * 1.35;
    const minFlux = 620 + this._smRms * 2400;

    if (flux > adaptiveFlux && flux > minFlux && now - this._lastOnsetT > 0.055) {
      isOnset = true;
      this._lastOnsetT = now;
      this._onsetPulse = 1.0;

      // Bass-gated beat detection — min 240ms inter-beat
      const bassGate = subRaw * 0.75 + bassRaw * 1.15 + lowTransient * 0.8;
      if ((lowFlux > midFlux * 0.35 || bassGate > 0.35) && bassGate > 0.22 && now - this._lastBeatTime > 0.24) {
        this._beatTimes.push(now);
        if (this._beatTimes.length > 18) this._beatTimes.shift();
        this._lastBeatTime = now;
        this._beatPulse = 1.0;

        // BPM from median interval over recent beats
        if (this._beatTimes.length >= 4) {
          const intervals = [];
          for (let i = 1; i < this._beatTimes.length; i++) {
            intervals.push(this._beatTimes[i] - this._beatTimes[i - 1]);
          }
          intervals.sort((a, b) => a - b);
          const median = intervals[Math.floor(intervals.length / 2)];
          if (median > 0.22 && median < 1.15) {
            const newBpm = 60 / median;
            this._bpm = this._bpm === 0 ? newBpm : (this._bpm * 0.72 + newBpm * 0.28);
          }
        }
      }
    }

    // Attack/release smoothing per band
    this._smSub  = this._smoothValue(this._smSub,  subRaw,                         0.42, 0.08);
    this._smLow  = this._smoothValue(this._smLow,  bassRaw,                         0.40, 0.09);
    this._smMid  = this._smoothValue(this._smMid,  lowMidRaw * 0.25 + midRaw * 0.75, 0.30, 0.12);
    this._smHigh = this._smoothValue(this._smHigh, highRaw * 0.82 + airRaw * 0.18,   0.34, 0.10);
    this._smRms  = this._smRms * 0.70 + rms * 0.30;

    // Energy ramp: smoothed per-frame derivative of rms (normalised)
    const _rawRamp = this._smRms - this._prevSmRms;
    this._prevSmRms  = this._smRms;
    this._energyRamp = this._energyRamp * 0.80 + _rawRamp * 0.20;

    // Composite values
    const rawBassImpact = Math.min(1.8, this._smSub * 0.85 + this._smLow * 1.10 + lowTransient * 0.35 + this._beatPulse * 0.55);
    const rawMidWave    = Math.min(2.0, this._smMid * 1.45 + lowMidRaw * 0.45 + this._onsetPulse * 0.30);
    const rawLavaLight  = Math.min(2.2, this._smSub * 0.85 + this._smLow * 1.10 + this._smRms * 0.65 + this._beatPulse * 0.75);
    const rawRibbon     = Math.min(2.0, this._smMid * 0.85 + this._smHigh * 0.65 + this._onsetPulse * 0.65 + this._beatPulse * 0.25);

    this._bassImpact  = this._smoothValue(this._bassImpact,  rawBassImpact, 0.45, 0.12);
    this._midWave     = this._smoothValue(this._midWave,     rawMidWave,    0.32, 0.16);
    this._lavaLight   = this._smoothValue(this._lavaLight,   rawLavaLight,  0.42, 0.13);
    this._ribbonDrive = this._smoothValue(this._ribbonDrive, rawRibbon,     0.45, 0.16);

    // Slow chroma smoothing (7% attack)
    const ca = 0.07;
    this._chromaR = this._chromaR * (1 - ca) + cR * ca;
    this._chromaG = this._chromaG * (1 - ca) + cG * ca;
    this._chromaB = this._chromaB * (1 - ca) + cB * ca;

    // Pulse decay each frame
    this._beatPulse  *= 0.88;
    this._onsetPulse *= 0.84;

    return {
      sub:        this._smSub,
      low:        this._smLow,
      mid:        this._smMid,
      high:       this._smHigh,
      rms:        this._smRms,
      bassImpact: this._bassImpact,
      midWave:    this._midWave,
      lavaLight:  this._lavaLight,
      ribbonDrive: this._ribbonDrive,
      beatPulse:  this._beatPulse,
      onsetPulse: this._onsetPulse,
      isOnset,
      bpm:        this._bpm,
      chroma:     [this._chromaR, this._chromaG, this._chromaB],
      energyRamp: this._energyRamp,
    };
  }

  dispose() {
    try { this._analyser.disconnect(); } catch (_e) {}
    this._analyser = null;
  }
}
