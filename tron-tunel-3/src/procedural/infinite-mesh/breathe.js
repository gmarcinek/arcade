// Macro breathe envelope — 85s cycle driving waveAmp/shakeAmp:
//   0-13s   : low  (0.10)
//   13-17s  : rise (0.10 → 0.40)
//   17-23s  : medium (0.40)
//   23-27s  : fall (0.40 → 0.10)
//   27-53s  : low  (0.10)
//   53-57s  : rise (0.10 → 0.70)
//   57-68s  : high (0.70)
//   68-75s  : drop (0.70 → 0)
//   75-85s  : climax — sine arc 0 → 1.0 → 0

const CYCLE = 85.0;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3.0 - 2.0 * t);
}

export function breatheLevel(time) {
  const s = time % CYCLE;
  if (s < 13.0) return 0.10;
  if (s < 17.0) return 0.10 + 0.30 * smoothstep(13.0, 17.0, s);  // 0.10 → 0.40
  if (s < 23.0) return 0.40;
  if (s < 27.0) return 0.40 - 0.30 * smoothstep(23.0, 27.0, s);  // 0.40 → 0.10
  if (s < 53.0) return 0.10;
  if (s < 57.0) return 0.10 + 0.60 * smoothstep(53.0, 57.0, s);  // 0.10 → 0.70
  if (s < 68.0) return 0.70;
  if (s < 75.0) return 0.70 * (1.0 - smoothstep(68.0, 75.0, s)); // 0.70 → 0.0
  // 75..85: climax — sine arc 0 → 1.0 → 0
  return Math.sin(((s - 75.0) / 10.0) * Math.PI);
}
