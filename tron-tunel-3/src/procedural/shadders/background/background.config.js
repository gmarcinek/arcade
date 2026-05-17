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
    // Jak mocno znormalizowana energia przesuwa ogólną jasność plam.
    energyScale: 0.28,

    // Mnożnik sygnału bass-impact (uderzenie basu) — plamy 3 i 4 reagują na to najsilniej.
    // 0.10 = subtelne, 0.25 = wyraźne błyski, 0.40 = mocne pulsowanie.
    bassPulse: 0.68,

    // Mnożnik sygnału beat-pulse (rytm podtrzymywany).
    // 0.08 = delikatne, 0.20 = wyraźny rytm, 0.35 = agresywne.
    beatPulse: 0.70,
  },
};  
