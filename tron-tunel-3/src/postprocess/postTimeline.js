/**
 * Post-process specialEffects timeline — 0..120 seconds.
 *
 * Each entry fires once when the playhead crosses its `time`.
 * This layer controls only high-level additions:
 *   startInvert / stopInvert   — InvertPass intensity 0→1 / 1→0
 *   startBw     / stopBw       — BlackAndWhitePass intensity 0→1 / 1→0
 *
 * Hue auto-oscillation and audio-driven hue/saturation/contrast stay outside this file.
 *
 * `lerp` (optional) — transition duration in seconds (default: 0 = instant)
 */
export const POST_TIMELINE = [
  { time: 20.0,  trigger: 'startInvert',          lerp: 0.5 },
  { time: 20.0,  trigger: 'startBw',              lerp: 0.5 },
  { time: 25.0,  trigger: 'stopInvert',           lerp: 1.5 },
  { time: 30.0,  trigger: 'stopBw',               lerp: 1.5 },

  // --- 60s: full invert + B&W combo ---
  { time: 55.0,  trigger: 'startInvert',          lerp: 0.5 },
  { time: 55.0,  trigger: 'startBw',              lerp: 0.5 },
  { time: 60.0,  trigger: 'stopInvert',           lerp: 0.5 },
  { time: 65.0,  trigger: 'stopBw',               lerp: 0.5 },

  // --- 105s: final invert ---
  { time: 105.0,  trigger: 'startInvert',          lerp: 0.5 },
  { time: 105.0,  trigger: 'startBw',              lerp: 0.5 },
  { time: 110.0,  trigger: 'stopInvert',           lerp: 0.5 },
  { time: 115.0,  trigger: 'stopBw',               lerp: 0.5 },
];
