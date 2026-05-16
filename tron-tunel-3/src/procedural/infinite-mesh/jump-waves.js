import { JUMP_WAVE_CONFIG } from '../../config.js';

// JumpWaveSystem
//
// Maintains a list of active jump-wave events (player bounces / jumps).
// Each wave has: { s, age, speed, power, frontS }.
//   s        — spline coord at trigger time
//   age      — seconds elapsed since trigger
//   speed    — propagation speed along the spline (fixed at trigger time)
//   power    — multiplier on visual amplitude
//   frontS   — current spline coord of the wave front
//
// At most 8 waves are written to the shader uniforms (matches array size in
// material.js). Waves older than 3 seconds are dropped each update.

const MAX_WAVES = 8;

export class JumpWaveSystem {
  constructor() {
    this._waves = [];
  }

  /** Read-only view for vertex-update.js. */
  get list() {
    return this._waves;
  }

  /**
   * Trigger a new wave. Speed = 1.5× ± 10% of current speed, fixed at
   * trigger time per JUMP_WAVE_CONFIG.
   */
  trigger(currentS, speed, power = 1.0) {
    const jw = JUMP_WAVE_CONFIG;
    const waveSpeed = speed * jw.speedMult * (1.0 + (Math.random() - 0.5) * jw.speedRandRange);
    this._waves.push({
      s: currentS,
      age: 0.0,
      speed: waveSpeed,
      power,
      frontS: currentS,
    });
  }

  /** Advance ages and front positions; drop expired waves. */
  update(dt) {
    for (const w of this._waves) {
      w.age   += dt;
      w.frontS = w.s + w.age * w.speed;
    }
    this._waves = this._waves.filter(w => w.age < 3.0);
  }

  /** Write current wave state into shader uniform arrays. */
  writeUniforms(uniforms) {
    const wS   = uniforms.uJumpWaveS.value;
    const wAge = uniforms.uJumpWaveAge.value;
    const wPow = uniforms.uJumpWavePower.value;

    for (let i = 0; i < MAX_WAVES; i++) {
      if (i < this._waves.length) {
        const w = this._waves[i];
        wS[i]   = w.frontS;
        wAge[i] = w.age;
        wPow[i] = w.power;
      } else {
        wS[i]   = -9999.0;
        wAge[i] = 99.0;
        wPow[i] = 0.0;
      }
    }

    uniforms.uJumpWaveGlowBlue.value  = JUMP_WAVE_CONFIG.glowBlue;
    uniforms.uJumpWaveGlowWhite.value = JUMP_WAVE_CONFIG.glowWhite;
  }
}
