/**
 * AudioManager — wszystkie dźwięki generowane proceduralnie przez Web Audio API.
 * Brak zewnętrznych plików audio → działa w single-file bundlu.
 */
export class AudioManager {
  constructor() {
    this._ctx       = null;
    this._masterGain = null;

    // Silnik
    this._engOsc1   = null;
    this._engOsc2   = null;
    this._engGain1  = null;
    this._engGain2  = null;
    this._engFilter = null;

    // Boost layer (rocket)
    this._boostRumbleOsc = null;
    this._boostGain      = null;
    this._boostNoiseSrc  = null;
    this._boostHissGain  = null;
    // Engine damage roughness
    this._dmgNoiseSrc    = null;
    this._dmgNoiseFilter = null;
    this._dmgGain        = null;

    this._started   = false;
    this._impactCooldown = 0;
  }

  // ── Inicjalizacja (musi być po geście użytkownika) ────────────────
  start() {
    if (this._started) return;
    this._started = true;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === 'suspended') this._ctx.resume();

    const ctx = this._ctx;

    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = 1.0;
    this._masterGain.connect(ctx.destination);

    // ── Silnik — dwa oscylatory sawtooth + filtr ──────────────────
    this._engFilter = ctx.createBiquadFilter();
    this._engFilter.type = 'lowpass';
    this._engFilter.frequency.value = 600;
    this._engFilter.Q.value = 1.5;
    this._engFilter.connect(this._masterGain);

    this._engGain1 = ctx.createGain();
    this._engGain1.gain.value = 0.07;
    this._engGain1.connect(this._engFilter);

    this._engOsc1 = ctx.createOscillator();
    this._engOsc1.type = 'sawtooth';
    this._engOsc1.frequency.value = 70;
    this._engOsc1.connect(this._engGain1);
    this._engOsc1.start();

    this._engGain2 = ctx.createGain();
    this._engGain2.gain.value = 0.10;
    this._engGain2.connect(this._engFilter);

    this._engOsc2 = ctx.createOscillator();
    this._engOsc2.type = 'sawtooth';
    this._engOsc2.frequency.value = 35;
    this._engOsc2.connect(this._engGain2);
    this._engOsc2.start();

    // ── Boost layer — rakietowy rąmk + szum ──────────────────────────────
    // Głębokie wibracje silnika rakietowego
    this._boostGain = ctx.createGain();
    this._boostGain.gain.value = 0.0;
    this._boostGain.connect(this._masterGain);

    this._boostRumbleOsc = ctx.createOscillator();
    this._boostRumbleOsc.type = 'sawtooth';
    this._boostRumbleOsc.frequency.value = 45;
    this._boostRumbleOsc.connect(this._boostGain);
    this._boostRumbleOsc.start();

    // Syk rakiety — pętla szumu przez highpass
    const boostNoiseLen = ctx.sampleRate * 2;
    const boostNoiseBuf = ctx.createBuffer(1, boostNoiseLen, ctx.sampleRate);
    const bnd = boostNoiseBuf.getChannelData(0);
    for (let i = 0; i < boostNoiseLen; i++) bnd[i] = Math.random() * 2 - 1;
    this._boostNoiseSrc = ctx.createBufferSource();
    this._boostNoiseSrc.buffer = boostNoiseBuf;
    this._boostNoiseSrc.loop = true;
    const boostHissFilter = ctx.createBiquadFilter();
    boostHissFilter.type = 'highpass';
    boostHissFilter.frequency.value = 1400;
    boostHissFilter.Q.value = 0.7;
    this._boostHissGain = ctx.createGain();
    this._boostHissGain.gain.value = 0.0;
    this._boostNoiseSrc.connect(boostHissFilter);
    boostHissFilter.connect(this._boostHissGain);
    this._boostHissGain.connect(this._masterGain);
    this._boostNoiseSrc.start();

    // ── Warstwa uszkodzeń silnika — chropowaty szum ──────────────────
    const dmgNoiseLen = ctx.sampleRate * 1;
    const dmgNoiseBuf = ctx.createBuffer(1, dmgNoiseLen, ctx.sampleRate);
    const dnd = dmgNoiseBuf.getChannelData(0);
    for (let i = 0; i < dmgNoiseLen; i++) dnd[i] = Math.random() * 2 - 1;
    this._dmgNoiseSrc = ctx.createBufferSource();
    this._dmgNoiseSrc.buffer = dmgNoiseBuf;
    this._dmgNoiseSrc.loop = true;
    this._dmgNoiseFilter = ctx.createBiquadFilter();
    this._dmgNoiseFilter.type = 'bandpass';
    this._dmgNoiseFilter.frequency.value = 120;
    this._dmgNoiseFilter.Q.value = 1.5;
    this._dmgGain = ctx.createGain();
    this._dmgGain.gain.value = 0.0;
    this._dmgNoiseSrc.connect(this._dmgNoiseFilter);
    this._dmgNoiseFilter.connect(this._dmgGain);
    this._dmgGain.connect(this._masterGain);
    this._dmgNoiseSrc.start();
  }

  // ── Aktualizacja silnika (co klatkę) ──────────────────────────────
  updateEngine(speedKmh, throttle, boostLevel, damagePct = 0) {
    if (!this._ctx || !this._started) return;
    const t = this._ctx.currentTime;

    // Częstotliwość = idle + prędkość + throttle
    const freq1 = 50 + speedKmh * 0.85 + Math.abs(throttle) * 25 + boostLevel * 55;
    const freq2 = freq1 * 0.5;

    // Silnik — jitter przy dużych uszkodzeniach (nierowny bieg)
    const jitter = damagePct > 0.4 ? (Math.random() - 0.5) * damagePct * 18 : 0;
    this._engOsc1.frequency.setTargetAtTime(Math.min(320, freq1 + jitter), t, 0.08);
    this._engOsc2.frequency.setTargetAtTime(Math.min(160, freq2), t, 0.08);

    // Głośność — cicho na biegu jałowym, głośniej przy gazie
    const baseVol = 0.04 + Math.abs(throttle) * 0.035;
    this._engGain1.gain.setTargetAtTime(baseVol, t, 0.06);
    this._engGain2.gain.setTargetAtTime(baseVol * 1.3, t, 0.06);

    // Filtr — bardziej przytłumiony przy uszkodzeniu (stłumiony warkot)
    const filterFreq = (400 + freq1 * 2) * (1.0 - damagePct * 0.45);
    this._engFilter.frequency.setTargetAtTime(Math.max(180, filterFreq), t, 0.1);

    // Boost — rakietowy rumbłe + syk
    this._boostRumbleOsc.frequency.setTargetAtTime(45 + boostLevel * 30 + speedKmh * 0.2, t, 0.06);
    this._boostGain.gain.setTargetAtTime(boostLevel * 0.12, t, 0.05);
    this._boostHissGain.gain.setTargetAtTime(boostLevel * 0.055, t, 0.05);

    // Uszkodzenia — chropowaty szum (kwadratowy wzrost z damage)
    const dmgNoise = damagePct * damagePct * 0.10;
    this._dmgGain.gain.setTargetAtTime(dmgNoise, t, 0.3);
    this._dmgNoiseFilter.frequency.setTargetAtTime(70 + freq1 * 0.5, t, 0.2);

    if (this._impactCooldown > 0) this._impactCooldown--;
  }

  // ── Pomocnik: noise burst ─────────────────────────────────────────
  _playNoise(durationSec, gainPeak, filterFreq, filterType = 'bandpass') {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const bufLen = ctx.sampleRate * durationSec;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    filt.Q.value = 3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainPeak, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    src.connect(filt);
    filt.connect(g);
    g.connect(this._masterGain);
    src.start();
    src.stop(ctx.currentTime + durationSec);
  }

  // ── Pomocnik: tone blip ───────────────────────────────────────────
  _playTone(freq, type, durationSec, gainPeak, rampSec) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainPeak, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (rampSec || durationSec));

    osc.connect(g);
    g.connect(this._masterGain);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  }

  // ── Uderzenie / kolizja ────────────────────────────────────────────
  playImpact(intensity = 1.0) {
    if (!this._ctx || this._impactCooldown > 0) return;
    this._impactCooldown = 8; // max ~8 klatek między dźwiękami

    const vol = Math.min(1.0, intensity);
    // Niski "thud" + noise
    this._playNoise(0.22, vol * 0.55, 120, 'lowpass');
    this._playTone(80 - intensity * 20, 'sine', 0.18, vol * 0.35, 0.15);
    if (intensity > 0.5) {
      // Przy mocnych uderzeniach — metaliczny dzwonek
      this._playTone(420, 'triangle', 0.3, vol * 0.2, 0.28);
    }
  }

  // ── Rozjechanie zombie ────────────────────────────────────────────
  playZombieHit() {
    if (!this._ctx) return;
    this._playNoise(0.14, 0.4, 300, 'bandpass');
    this._playTone(55, 'sine', 0.12, 0.25, 0.10);
  }

  // ── Eksplozja NPC auta ────────────────────────────────────────────
  playCarExplosion() {
    if (!this._ctx) return;
    // Gruba eksplozja — niski noise + krótki "boom"
    this._playNoise(0.9, 0.9, 80, 'lowpass');
    this._playNoise(0.4, 0.6, 600, 'bandpass');
    this._playTone(40, 'sine', 0.6, 0.7, 0.5);
  }

  // ── Leczenie ─────────────────────────────────────────────────────
  playHeal() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    // Dwa wznoszące tony
    [0, 0.10, 0.20].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440 + i * 160, t + offset);
      osc.frequency.linearRampToValueAtTime(580 + i * 160, t + offset + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.22);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.25);
    });
  }

  // ── Respawn ───────────────────────────────────────────────────────
  playRespawn() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    // Wznoszący akord + whoosh
    [0, 0.08, 0.16, 0.24].forEach((offset, i) => {
      const freqs = [220, 330, 440, 550];
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.5);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.5);
    });
    this._playNoise(0.3, 0.25, 2000, 'highpass');
  }

  // ── Wyczerpanie boosta ────────────────────────────────────────────
  playBoostEmpty() {
    if (!this._ctx) return;
    this._playTone(200, 'sawtooth', 0.2, 0.15, 0.18);
    this._playTone(140, 'sawtooth', 0.25, 0.12, 0.22);
  }

  // ── Start boosta ─────────────────────────────────────────────────
  playBoostStart() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    // Głęboki bas — ⋅ impuls odpalenia
    this._playTone(38, 'sawtooth', 0.35, 0.38, 0.30);
    // Sweep od 80 → 700 Hz — rakietowy wyrzut
    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(80, t);
    sweep.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.26, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    sweep.connect(sg);
    sg.connect(this._masterGain);
    sweep.start(t);
    sweep.stop(t + 0.25);
    // Wysoki syk — rozpędzony strumień gazu
    this._playNoise(0.30, 0.28, 2800, 'highpass');
  }
}
