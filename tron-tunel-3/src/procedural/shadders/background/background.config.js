export const BACKGROUND_SHADER_CONFIG = {
  geometry: {
    // Skybox sphere radius. Keep 200..400 — below clips, above hits far plane (500).
    radius: 260,
    widthSegments: 64,
    heightSegments: 48,
  },

  // EMA alpha for computing the smoothed energy baseline.
  // Higher = slower adaptation to volume changes.
  // 0.990 ≈ ~1.7s at 60fps,  0.995 ≈ ~3.3s,  0.999 ≈ ~17s
  energySmoothingAlpha: 0.995,

  strengths: {
    // Maps normalized energy (current / smoothedBaseline) → ramp position [0..1].
    // 0.40 = baseline sits in deep-red/purple zone, loud passages reach amber.
    // 0.60 = baseline in purple, loud reaches yellow/white.
    // 0.80 = baseline already in amber, very reactive.
    energyScale: 0.10,

    // How much a bass-impact transient (kick drum hit) adds a brightness jump.
    // 0.00 = no pulse, 0.08 = subtle flash, 0.18 = clearly visible, 0.30 = strong.
    bassPulse: 0.01,

    // Additional brightness bump on beat-pulse signal (sustain, softer than impact).
    // 0.00 = off, 0.04 = faint throb, 0.12 = audible rhythm visible.
    beatPulse: 0.02,
  },
};
