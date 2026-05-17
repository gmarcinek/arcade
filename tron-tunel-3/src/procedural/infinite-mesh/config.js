// ---- Shader / effect config ------------------------------------------------
// PALETTE: black/navy body / hot orange edges / deep blue structure.
// Yellow is intentionally removed from core tunnel lighting.
//
// Parallax in this file is a fake material-depth effect:
// every shader layer samples a slightly different virtual angle/S coordinate.
// Some layers also react to signed deltaA/deltaS from AudioMetadataBus.

export const TUNNEL_FX_CONFIG = {
  fxBass:         1.0,
  fxBeat:         1.0,
  fxOnset:        1.0,
  fxMid:          1.0,
  fxEnergy:       0.75,
  shakeAmp:       0.08,
  waveAmp:        5,
  emergeDist:     500,

  parallax: {
    amount:       2.0, // Overall strength of parallax effect. Higher = more apparent depth, but also more distortion and potential motion sickness.
    flow:         0.0, // Overall flow speed of parallax layers. Higher = more distortion, but also more noticeable movement on near layers.
    depthStretch: 3.0, // Stretching depth exaggerates parallax on near layers, while compressing it on far layers. This helps sell the effect without causing extreme distortion on close layers.
    audioPush:    12.0, // Strength of parallax movement in response to audio. Higher = more reactive, but can cause distracting jitter when audio is intense.

    // Can be overwritten/additively driven by AudioMetadataBus:
    // deltaA / parallaxDeltaA, deltaS / parallaxDeltaS, range -1..1.
    deltaA:       0.0,
    deltaS:       0.0,

    // Negative depth = closer / foreground-like.
    // Positive depth = deeper / background-like.
    layerDepth: {
      bgFlares:     1.45,
      lava:         0.90,
      lavaDeep:     1.18,
      waveform:    -0.18,
      longBlue:     0.18,
      longOrange:   0.52,
      twistBlue:    0.72,
      twistOrange:  1.05,
      grid:         0.06,
      strips:      -0.10,
      tilesOrange: -0.34,
      tilesBlue:    0.58,
      chevrons:    -0.24,
      frontPalette: 1.28,
    },
  },

  // Primary body / structure.
  baseNavy:        [0.005, 0.010, 0.025],
  deepNavy:        [0.010, 0.035, 0.105],
  structureBlue:   [0.040, 0.300, 0.850],
  waveformBlue:    [0.070, 0.520, 1.000],
  electricBlue:    [0.020, 0.720, 1.000],

  // Orange heat family.
  lavaColorDark:   [0.330, 0.070, 0.000],
  lavaColorMid:    [0.900, 0.220, 0.020],
  lavaColorHot:    [1.000, 0.200, 0.020],
  dashOrange:      [1.000, 0.160, 0.020],
  edgeOrange:      [1.000, 0.220, 0.000],
  contactWarm:     [1.000, 0.500, 0.120],

  // Opposite-pair accent families.
  accentRed:       [1.000, 0.040, 0.020],
  accentEmerald:   [0.000, 0.950, 0.650],
  accentAfrican:   [1.000, 0.520, 0.050],
  accentFuchsia:   [1.000, 0.000, 0.760],

  // Cycle timing.
  layerCyclePeriod: 8.0,    // seconds per layer visibility cycle
  brightCyclePeriod: 60.0,  // seconds for full bright→dark→bright
  brightMin: 0.18,           // multiplier at darkest point
  brightMax: 1.00,           // multiplier at brightest point

  opacity: {
    // phase: radians offset into the layer cycle (spreads layers apart in time)
    grid:         { min: 0.00, max: 1.00, source: 'rms',         smooth: 1.8,  phase: 0.00 },
    waveform:     { min: 0.00, max: 1.00, source: 'midWave',     smooth: 4.0,  phase: 1.18 },
    lava:         { min: 0.00, max: 0.85, source: 'lavaLight',   smooth: 3.2,  phase: 2.36 },
    lavaDeep:     { min: 0.00, max: 0.70, source: 'low',         smooth: 4.5,  phase: 3.54 },
    strips:       { min: 0.00, max: 0.90, source: 'mid',         smooth: 5.0,  phase: 4.71 },
    longBands:    { min: 0.00, max: 0.85, source: 'ribbonDrive', smooth: 3.5,  phase: 5.89 },
    twistBands:   { min: 0.00, max: 0.95, source: 'midWave',     smooth: 4.5,  phase: 0.79 },
    tilesOrange:  { min: 0.00, max: 0.95, source: 'bassImpact',  smooth: 8.0,  phase: 1.97 },
    tilesBlue:    { min: 0.00, max: 0.60, source: 'high',        smooth: 4.0,  phase: 3.14 },
    chevrons:     { min: 0.00, max: 0.75, source: 'beatPulse',   smooth: 9.0,  phase: 4.32 },
    floorEdge:    { min: 0.12, max: 1.00, source: 'rms',         smooth: 2.8,  phase: 0.39 },
    contact:      { min: 0.25, max: 1.00, source: 'onsetPulse',  smooth: 10.0, phase: 0.00 },
    bgFlares:     { min: 0.00, max: 0.85, source: 'rms',         smooth: 1.2,  phase: 5.50 },
    frontPalette: { min: 0.00, max: 0.85, source: 'onsetPulse',  smooth: 5.5,  phase: 2.75 },
  },
};
