import * as THREE from 'three';
import { TUNNEL_R } from '../config.js';
import { AudioMetadataBus } from '../audio/AudioMetadataBus.js';
import { vertexShader, fragmentShader } from './shadders/tunel/mesh.shaders.js';

const RING_COUNT  = 80;
const RADIAL_SEGS = 64;
const RING_STEP   = 7;
const BEHIND_DIST = 50;
const TOTAL_LEN   = RING_COUNT * RING_STEP;

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
    flow:         3.0, // Overall flow speed of parallax layers. Higher = more distortion, but also more noticeable movement on near layers.
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
  lavaColorHot:    [1.000, 0.360, 0.020],
  dashOrange:      [1.000, 0.300, 0.020],
  edgeOrange:      [1.000, 0.220, 0.000],
  contactWarm:     [1.000, 0.500, 0.120],

  // Opposite-pair accent families.
  accentRed:       [1.000, 0.040, 0.020],
  accentEmerald:   [0.000, 0.950, 0.650],
  accentAfrican:   [1.000, 0.520, 0.050],
  accentFuchsia:   [1.000, 0.000, 0.760],

  jumpWave: {
    speedMult:        1.6,   // wave speed = player speed × speedMult
    speedRandRange:   0.2,   // ±random spread on speed (0 = no random, 0.2 = ±10%)
    duration:         4.0,   // seconds until wave fades out completely
    envelopeBase:    14.0,   // Gaussian envelope width at age=0 (metres)
    envelopeGrow:     5.0,   // envelope width growth per second
    oscillationCycle: 12.0,  // full sine cycle length (metres): bump + dip
    waveAmp:          0.18,  // hill-valley oscillation amplitude (fraction of radius)
    pushAmp:          0.32,  // radial push amplitude (fraction of radius)
    pushWidthBase:   15.0,   // push Gaussian width at age=0 (metres)
    pushWidthGrow:    2.0,   // push width growth per second
    pushOffset:       4.0,   // push centre offset behind wave front (metres)
    glowBlue:         1.12,  // glow intensity — electric blue channel
    glowWhite:        2.70,  // glow intensity — white shimmer channel
  },

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

function makeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,

    uniforms: {
      time:           { value: 0 },
      playerGlobalS:  { value: 0 },
      playerWorldPos: { value: new THREE.Vector3() },
      behindDist:     { value: BEHIND_DIST },
      totalLen:       { value: TOTAL_LEN },

      // Audio.
      uSubBass:       { value: 0 },
      uBass:          { value: 0 },
      uMid:           { value: 0 },
      uTreble:        { value: 0 },
      uBassImpact:    { value: 0 },
      uMidWave:       { value: 0 },
      uLavaLight:     { value: 0 },
      uRibbonDrive:   { value: 0 },
      uOnsetPulse:    { value: 0 },
      uBeatPulse:     { value: 0 },
      uMusicEnergy:   { value: 0 },
      uChromaTint:    { value: new THREE.Vector3(0, 0, 0) },

      // FX config.
      uFxBass:         { value: 1 },
      uFxBeat:         { value: 1 },
      uFxOnset:        { value: 1 },
      uFxMid:          { value: 1 },
      uFxEnergy:       { value: 1 },
      uGlobalBright:   { value: 1.0 },
      uSilenceGrid:    { value: 1.0 },
      uEmergeDist:     { value: 500 },

      // Fake material-depth / parallax.
      uParallaxAmount:       { value: 1.0 },
      uParallaxFlow:         { value: 1.0 },
      uParallaxDepthStretch: { value: 0.75 },
      uParallaxAudioPush:    { value: 1.0 },
      uParallaxDeltaA:       { value: 0.0 },
      uParallaxDeltaS:       { value: 0.0 },

      uDepthBgFlares:     { value: 1.45 },
      uDepthLava:         { value: 0.90 },
      uDepthLavaDeep:     { value: 1.18 },
      uDepthWaveform:     { value: -0.18 },
      uDepthLongBlue:     { value: 0.18 },
      uDepthLongOrange:   { value: 0.52 },
      uDepthTwistBlue:    { value: 0.72 },
      uDepthTwistOrange:  { value: 1.05 },
      uDepthGrid:         { value: 0.06 },
      uDepthStrips:       { value: -0.10 },
      uDepthTilesOrange:  { value: -0.34 },
      uDepthTilesBlue:    { value: 0.58 },
      uDepthChevrons:     { value: -0.24 },
      uDepthFrontPalette: { value: 1.28 },

      // Colors.
      uBaseNavy:        { value: new THREE.Vector3(0.005, 0.010, 0.025) },
      uDeepNavy:        { value: new THREE.Vector3(0.010, 0.035, 0.105) },
      uStructureBlue:   { value: new THREE.Vector3(0.040, 0.300, 0.850) },
      uWaveformBlue:    { value: new THREE.Vector3(0.070, 0.520, 1.000) },
      uElectricBlue:    { value: new THREE.Vector3(0.020, 0.720, 1.000) },

      uLavaColorDark:   { value: new THREE.Vector3(0.330, 0.070, 0.000) },
      uLavaColorMid:    { value: new THREE.Vector3(0.900, 0.220, 0.020) },
      uLavaColorHot:    { value: new THREE.Vector3(1.000, 0.360, 0.020) },
      uDashOrange:      { value: new THREE.Vector3(1.000, 0.300, 0.020) },
      uEdgeOrange:      { value: new THREE.Vector3(1.000, 0.220, 0.000) },
      uContactWarm:     { value: new THREE.Vector3(1.000, 0.500, 0.120) },

      uAccentRed:       { value: new THREE.Vector3(1.000, 0.040, 0.020) },
      uAccentEmerald:   { value: new THREE.Vector3(0.000, 0.950, 0.650) },
      uAccentAfrican:   { value: new THREE.Vector3(1.000, 0.520, 0.050) },
      uAccentFuchsia:   { value: new THREE.Vector3(1.000, 0.000, 0.760) },

      // Per-layer opacity.
      uOpGrid:          { value: 0.48 },
      uOpWaveform:      { value: 0.38 },
      uOpLava:          { value: 0.06 },
      uOpLavaDeep:      { value: 0.04 },
      uOpStrips:        { value: 0.08 },
      uOpLongBands:     { value: 0.08 },
      uOpTwistBands:    { value: 0.03 },
      uOpTilesOrange:   { value: 0.00 },
      uOpTilesBlue:     { value: 0.07 },
      uOpChevrons:      { value: 0.00 },
      uOpFloorEdge:     { value: 0.20 },
      uOpContact:       { value: 0.30 },
      uOpBgFlares:      { value: 0.02 },
      uOpFrontPalette:  { value: 0.00 },
      uHeatZoneFrac:    { value: 0.0 },
      uEdgeHeat:        { value: 0.0 },
      uJumpWaveS:        { value: new Array(8).fill(-9999.0) },
      uJumpWaveAge:      { value: new Array(8).fill(99.0) },
      uJumpWavePower:    { value: new Array(8).fill(0.0) },
      uJumpWaveGlowBlue: { value: TUNNEL_FX_CONFIG.jumpWave.glowBlue },
      uJumpWaveGlowWhite:{ value: TUNNEL_FX_CONFIG.jumpWave.glowWhite },
    },

    vertexShader,
    fragmentShader,

  });
}

export class InfiniteMesh {
  constructor(scene, spline, crossSection) {
    this._scene  = scene;
    this._spline = spline;
    this._cs     = crossSection;
    this._time   = 0;
    this._opSmooth = {};
    this._jumpWaves = [];
    this._build();
  }

  get material() {
    return this._mat;
  }

  setSpline(spline) {
    this._spline = spline;
  }

  setHeatZone(frac, heat) {
    this._mat.uniforms.uHeatZoneFrac.value = frac;
    this._mat.uniforms.uEdgeHeat.value     = heat;
  }

  /** Call when player jumps or bounces. Each call adds a new wave. Speed = 1.5× ± 10% of current speed, fixed at trigger time. */
  triggerJumpWave(currentS, speed, power = 1.0) {
    const jw = TUNNEL_FX_CONFIG.jumpWave;
    const waveSpeed = speed * jw.speedMult * (1.0 + (Math.random() - 0.5) * jw.speedRandRange);
    const wave = { s: currentS, age: 0.0, speed: waveSpeed, power, frontS: currentS };
    this._jumpWaves.push(wave);
    // Uniform arrays are written every frame in update() — do NOT set .value here.
  }

  _build() {
    const VERT_COLS = RADIAL_SEGS + 1;
    const VERT_ROWS = RING_COUNT  + 1;
    const vertCount = VERT_ROWS * VERT_COLS;

    const positions = new Float32Array(vertCount * 3);
    const normals   = new Float32Array(vertCount * 3);
    const uvs       = new Float32Array(vertCount * 2);

    for (let r = 0; r <= RING_COUNT; r++) {
      for (let c = 0; c <= RADIAL_SEGS; c++) {
        const vi = r * VERT_COLS + c;
        uvs[vi * 2 + 0] = c / RADIAL_SEGS;
        uvs[vi * 2 + 1] = r / RING_COUNT;
      }
    }

    const indices = [];
    for (let r = 0; r < RING_COUNT; r++) {
      for (let c = 0; c < RADIAL_SEGS; c++) {
        const a = r       * VERT_COLS + c;
        const b = r       * VERT_COLS + c + 1;
        const d = (r + 1) * VERT_COLS + c;
        const e = (r + 1) * VERT_COLS + c + 1;
        indices.push(a, b, e, a, e, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'normal',
      new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    this._mat  = makeMaterial();
    this._mesh = new THREE.Mesh(geo, this._mat);
    this._mesh.frustumCulled = false;
    this._geo = geo;

    this._scene.add(this._mesh);
  }

  _sourceValue(audio, source) {
    if (!audio) return 0;

    if (source === 'bass') return this._sourceValue(audio, 'low');
    if (source === 'musicEnergy') return this._sourceValue(audio, 'rms');
    if (source === 'energy') return this._sourceValue(audio, 'rms');
    if (source === 'treble') return this._sourceValue(audio, 'high');

    const raw = audio[source];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(0, Math.min(1, raw));
    }

    return 0;
  }

  _signedSourceValue(audio, names, fallback = 0) {
    if (!audio) return fallback;

    for (const name of names) {
      const raw = audio[name];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(-1, Math.min(1, raw));
      }
    }

    return fallback;
  }

  _evalOpacity(name, audio, dt) {
    const rule = TUNNEL_FX_CONFIG.opacity[name];
    if (!rule) return 0;

    const srcVal = this._sourceValue(audio, rule.source);
    const target = rule.min + (rule.max - rule.min) * srcVal;

    const prev = Object.prototype.hasOwnProperty.call(this._opSmooth, name)
      ? this._opSmooth[name]
      : target;

    const smooth = rule.smooth ?? 5.0;
    const alpha = 1.0 - Math.exp(-dt * smooth);
    const next = prev + (target - prev) * alpha;
    this._opSmooth[name] = next;

    // Per-layer slow cycle: each layer pulses in and out independently.
    // Gate goes 0→1 with smoothstep so transitions are soft, not abrupt.
    const period = TUNNEL_FX_CONFIG.layerCyclePeriod ?? 8.0;
    const phase  = rule.phase ?? 0.0;
    const osc    = 0.5 + 0.5 * Math.sin((this._time * Math.PI * 2.0) / period + phase);
    // Remap so top 60% of osc = fully on, bottom 40% = fully off, smooth blend between.
    const gate   = Math.max(0, Math.min(1, (osc - 0.25) / 0.45));

    // contact and floorEdge are gameplay elements — never fully gated off.
    if (name === 'contact' || name === 'floorEdge') return next;

    return next * gate;
  }

  _syncAudioUniforms(audio) {
    const u = this._mat.uniforms;
    const chroma = Array.isArray(audio?.chroma) ? audio.chroma : [0, 0, 0];

    u.uSubBass.value     = this._sourceValue(audio, 'sub');
    u.uBass.value        = this._sourceValue(audio, 'low');
    u.uMid.value         = this._sourceValue(audio, 'mid');
    u.uTreble.value      = this._sourceValue(audio, 'high');
    u.uBassImpact.value  = this._sourceValue(audio, 'bassImpact');
    u.uMidWave.value     = this._sourceValue(audio, 'midWave');
    u.uLavaLight.value   = this._sourceValue(audio, 'lavaLight');
    u.uRibbonDrive.value = this._sourceValue(audio, 'ribbonDrive');
    u.uOnsetPulse.value  = this._sourceValue(audio, 'onsetPulse');
    u.uBeatPulse.value   = this._sourceValue(audio, 'beatPulse');
    u.uMusicEnergy.value = this._sourceValue(audio, 'rms');

    u.uChromaTint.value.set(
      Number.isFinite(chroma[0]) ? chroma[0] : 0,
      Number.isFinite(chroma[1]) ? chroma[1] : 0,
      Number.isFinite(chroma[2]) ? chroma[2] : 0,
    );

    // Silence grid: fades out as music energy rises, fades in when silent.
    // Use a slow lerp (stored on _silenceGrid) so transition is gradual (~2 sec).
    const rms = this._sourceValue(audio, 'rms');
    const silenceTarget = 1.0 - Math.min(1.0, rms * 4.0); // goes to 0 above rms=0.25
    if (this._silenceGrid === undefined) this._silenceGrid = 1.0;
    this._silenceGrid += (silenceTarget - this._silenceGrid) * (1.0 - Math.exp(-this._lastDt * 0.6));
    u.uSilenceGrid.value = Math.max(0, this._silenceGrid);
  }

  _syncConfigUniforms(audio) {
    const cfg = TUNNEL_FX_CONFIG;
    const p = cfg.parallax;
    const d = p.layerDepth;
    const u = this._mat.uniforms;

    u.uFxBass.value     = cfg.fxBass;
    u.uFxBeat.value     = cfg.fxBeat;
    u.uFxOnset.value    = cfg.fxOnset;
    u.uFxMid.value      = cfg.fxMid;
    u.uFxEnergy.value   = cfg.fxEnergy;
    u.uEmergeDist.value = cfg.emergeDist;

    u.uParallaxAmount.value       = p.amount;
    u.uParallaxFlow.value         = p.flow;
    u.uParallaxDepthStretch.value = p.depthStretch;
    u.uParallaxAudioPush.value    = p.audioPush;

    const audioDeltaA = this._signedSourceValue(audio, ['parallaxDeltaA', 'deltaA'], 0);
    const audioDeltaS = this._signedSourceValue(audio, ['parallaxDeltaS', 'deltaS'], 0);

    u.uParallaxDeltaA.value = Math.max(-1, Math.min(1, (p.deltaA ?? 0) + audioDeltaA));
    u.uParallaxDeltaS.value = Math.max(-1, Math.min(1, (p.deltaS ?? 0) + audioDeltaS));

    u.uDepthBgFlares.value     = d.bgFlares;
    u.uDepthLava.value         = d.lava;
    u.uDepthLavaDeep.value     = d.lavaDeep;
    u.uDepthWaveform.value     = d.waveform;
    u.uDepthLongBlue.value     = d.longBlue;
    u.uDepthLongOrange.value   = d.longOrange;
    u.uDepthTwistBlue.value    = d.twistBlue;
    u.uDepthTwistOrange.value  = d.twistOrange;
    u.uDepthGrid.value         = d.grid;
    u.uDepthStrips.value       = d.strips;
    u.uDepthTilesOrange.value  = d.tilesOrange;
    u.uDepthTilesBlue.value    = d.tilesBlue;
    u.uDepthChevrons.value     = d.chevrons;
    u.uDepthFrontPalette.value = d.frontPalette;

    u.uBaseNavy.value.set(...cfg.baseNavy);
    u.uDeepNavy.value.set(...cfg.deepNavy);
    u.uStructureBlue.value.set(...cfg.structureBlue);
    u.uWaveformBlue.value.set(...cfg.waveformBlue);
    u.uElectricBlue.value.set(...cfg.electricBlue);

    u.uLavaColorDark.value.set(...cfg.lavaColorDark);
    u.uLavaColorMid.value.set(...cfg.lavaColorMid);
    u.uLavaColorHot.value.set(...cfg.lavaColorHot);
    u.uDashOrange.value.set(...cfg.dashOrange);
    u.uEdgeOrange.value.set(...cfg.edgeOrange);
    u.uContactWarm.value.set(...cfg.contactWarm);

    u.uAccentRed.value.set(...cfg.accentRed);
    u.uAccentEmerald.value.set(...cfg.accentEmerald);
    u.uAccentAfrican.value.set(...cfg.accentAfrican);
    u.uAccentFuchsia.value.set(...cfg.accentFuchsia);

    // Global bright/dark cycle — 30 sec bright, 30 sec dark (60 sec full cycle).
    const cfg2 = TUNNEL_FX_CONFIG;
    const brightOsc = 0.5 + 0.5 * Math.sin((this._time * Math.PI * 2.0) / (cfg2.brightCyclePeriod ?? 60.0));
    const brightVal = (cfg2.brightMin ?? 0.18) + ((cfg2.brightMax ?? 1.0) - (cfg2.brightMin ?? 0.18)) * brightOsc;
    this._mat.uniforms.uGlobalBright.value = brightVal;
  }

  _syncOpacityUniforms(audio, dt) {
    const u = this._mat.uniforms;

    u.uOpGrid.value         = this._evalOpacity('grid',         audio, dt);
    u.uOpWaveform.value     = this._evalOpacity('waveform',     audio, dt);
    u.uOpLava.value         = this._evalOpacity('lava',         audio, dt);
    u.uOpLavaDeep.value     = this._evalOpacity('lavaDeep',     audio, dt);
    u.uOpStrips.value       = this._evalOpacity('strips',       audio, dt);
    u.uOpLongBands.value    = this._evalOpacity('longBands',    audio, dt);
    u.uOpTwistBands.value   = this._evalOpacity('twistBands',   audio, dt);
    u.uOpTilesOrange.value  = this._evalOpacity('tilesOrange',  audio, dt);
    u.uOpTilesBlue.value    = this._evalOpacity('tilesBlue',    audio, dt);
    u.uOpChevrons.value     = this._evalOpacity('chevrons',     audio, dt);
    u.uOpFloorEdge.value    = this._evalOpacity('floorEdge',    audio, dt);
    u.uOpContact.value      = this._evalOpacity('contact',      audio, dt);
    u.uOpBgFlares.value     = this._evalOpacity('bgFlares',     audio, dt);
    u.uOpFrontPalette.value = this._evalOpacity('frontPalette', audio, dt);
  }

  // Macro breathe envelope — 85s cycle:
  // 0-15s low, 15-25s medium, 25-55s low, 55-70s high, 70-75s drop to 0, 75-85s climax peak
  _breatheLevel() {
    const CYCLE = 85.0;
    const s = this._time % CYCLE;
    const sm = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3.0 - 2.0 * t);
    };
    if (s < 13.0) return 0.10;
    if (s < 17.0) return 0.10 + 0.30 * sm(13.0, 17.0, s);  // 0.10 → 0.40
    if (s < 23.0) return 0.40;
    if (s < 27.0) return 0.40 - 0.30 * sm(23.0, 27.0, s);  // 0.40 → 0.10
    if (s < 53.0) return 0.10;
    if (s < 57.0) return 0.10 + 0.60 * sm(53.0, 57.0, s);  // 0.10 → 0.70
    if (s < 68.0) return 0.70;
    if (s < 75.0) return 0.70 * (1.0 - sm(68.0, 75.0, s)); // 0.70 → 0.0
    // 75..85: climax — sine arc 0 → 1.0 → 0
    return Math.sin(((s - 75.0) / 10.0) * Math.PI);
  }

  update(playerGlobalS, playerWorldPos, dt) {
    this._time += dt;
    this._lastDt = dt;

    // Advance all jump waves
    for (const w of this._jumpWaves) {
      w.age   += dt;
      w.frontS = w.s + w.age * w.speed;
    }
    this._jumpWaves = this._jumpWaves.filter(w => w.age < 3.0);

    // Write all active waves into shader uniform arrays (max 8 slots)
    const _wS   = this._mat.uniforms.uJumpWaveS.value;
    const _wAge = this._mat.uniforms.uJumpWaveAge.value;
    const _wPow = this._mat.uniforms.uJumpWavePower.value;
    for (let _i = 0; _i < 8; _i++) {
      if (_i < this._jumpWaves.length) {
        const _w = this._jumpWaves[_i];
        _wS[_i]   = _w.frontS;
        _wAge[_i] = _w.age;
        _wPow[_i] = _w.power;
      } else {
        _wS[_i]   = -9999.0;
        _wAge[_i] = 99.0;
        _wPow[_i] = 0.0;
      }
    }
    this._mat.uniforms.uJumpWaveGlowBlue.value  = TUNNEL_FX_CONFIG.jumpWave.glowBlue;
    this._mat.uniforms.uJumpWaveGlowWhite.value = TUNNEL_FX_CONFIG.jumpWave.glowWhite;

    const cfg = TUNNEL_FX_CONFIG;
    const audio = AudioMetadataBus.get();
    const EMERGE_DIST = cfg.emergeDist;

    // Breathing envelope: drive waveAmp and shakeAmp through the macro pattern
    const _bl = this._breatheLevel();
    cfg.waveAmp  = 0.5 + _bl * 4.5;
    cfg.shakeAmp = _bl * 0.08;

    this._syncAudioUniforms(audio);
    this._syncConfigUniforms(audio);
    this._syncOpacityUniforms(audio, dt);

    const VERT_COLS = RADIAL_SEGS + 1;
    const pos = this._geo.attributes.position.array;
    const nor = this._geo.attributes.normal.array;

    for (let r = 0; r <= RING_COUNT; r++) {
      const ringS = playerGlobalS - BEHIND_DIST + r * RING_STEP;
      const f = this._spline.getFrameAt(ringS);
      if (!f) continue;

      const arcSpan = this._cs ? this._cs.getArcSpan(ringS) : 1.0;
      const uHalf   = arcSpan * Math.PI;
      const uCenter = Math.PI;

      const twistRot = this._cs ? this._cs.getTwist(ringS) * Math.PI * 2 : 0;
      const cosT = Math.cos(twistRot);
      const sinT = Math.sin(twistRot);

      const norTx = f.nor.x * cosT + f.bin.x * sinT;
      const norTy = f.nor.y * cosT + f.bin.y * sinT;
      const norTz = f.nor.z * cosT + f.bin.z * sinT;

      const binTx = -f.nor.x * sinT + f.bin.x * cosT;
      const binTy = -f.nor.y * sinT + f.bin.y * cosT;
      const binTz = -f.nor.z * sinT + f.bin.z * cosT;

      const ahead = ringS - playerGlobalS;

      let emergeFactor;
      if (ahead <= 0) {
        emergeFactor = 1.0;
      } else {
        const t = Math.max(0, Math.min(1, ahead / EMERGE_DIST));
        emergeFactor = 1.0 - t * t * (3.0 - 2.0 * t);
      }

      const radiusFactor = 0.035 + 0.965 * emergeFactor;

      // Jump wave — hill+valley oscillation + radial push/stretch
      let waveRadialBoost = 0.0;
      for (const w of this._jumpWaves) {
        const d = ringS - w.frontS;
        const jw1 = TUNNEL_FX_CONFIG.jumpWave;
        const envelope   = jw1.envelopeBase + w.age * jw1.envelopeGrow;
        const gaussian   = Math.exp(-(d * d) / (envelope * envelope));
        const ageFade    = Math.max(0, 1.0 - w.age / jw1.duration);

        // Hill-valley oscillation — flipped: hill arrives first (ahead of front), then valley at front
        const jw2 = TUNNEL_FX_CONFIG.jumpWave;
        const oscillation = -Math.cos(d * Math.PI * 2.0 / jw2.oscillationCycle);
        const wave        = jw2.waveAmp * oscillation * gaussian * ageFade * w.power;

        // Radial push: centered pushOffset metres behind wave front — comes after valley
        const pushWidth = jw2.pushWidthBase + w.age * jw2.pushWidthGrow;
        const dPush     = d + jw2.pushOffset;
        const push      = jw2.pushAmp * Math.exp(-(dPush * dPush) / (pushWidth * pushWidth)) * ageFade * w.power;

        waveRadialBoost += wave + push;
      }
      const effectiveRadius = radiusFactor * (1.0 + waveRadialBoost);

      const mid = this._sourceValue(audio, 'mid');
      const bassImpact = this._sourceValue(audio, 'bassImpact');

      const waveAmt   = (1.0 - emergeFactor) * mid * cfg.waveAmp * TUNNEL_R * 0.9;
      const wavePhase = ringS * 0.18 + this._time * 3.2;
      const waveDispN = Math.sin(wavePhase) * waveAmt;
      const waveDispB = Math.cos(wavePhase * 0.73 + 1.1) * waveAmt * 0.5;

      const shakeAmt =
        emergeFactor *
        bassImpact *
        cfg.shakeAmp *
        TUNNEL_R *
        0.12;

      const shakePhase = ringS * 3.1 + this._time * 14.0;
      const shakeN = Math.sin(shakePhase) * shakeAmt;
      const shakeB = Math.cos(shakePhase * 0.8 + 2.3) * shakeAmt;

      const dispN = waveDispN + shakeN;
      const dispB = waveDispB + shakeB;

      for (let c = 0; c <= RADIAL_SEGS; c++) {
        const u_ang = uCenter - uHalf + (c / RADIAL_SEGS) * 2 * uHalf;

        const { x: cx, y: cy } = this._cs
          ? this._cs.getPoint(u_ang, ringS, TUNNEL_R)
          : {
              x: TUNNEL_R * Math.cos(u_ang),
              y: TUNNEL_R * Math.sin(u_ang),
            };

        const wx =
          f.pos.x +
          cx * effectiveRadius * norTx +
          cy * effectiveRadius * binTx +
          dispN * norTx +
          dispB * binTx;

        const wy =
          f.pos.y +
          cx * effectiveRadius * norTy +
          cy * effectiveRadius * binTy +
          dispN * norTy +
          dispB * binTy;

        const wz =
          f.pos.z +
          cx * effectiveRadius * norTz +
          cy * effectiveRadius * binTz +
          dispN * norTz +
          dispB * binTz;

        const nLocal = this._cs
          ? this._cs.getBallSideNormal(u_ang, ringS, TUNNEL_R)
          : {
              nx: Math.cos(u_ang),
              ny: Math.sin(u_ang),
            };

        const nx = nLocal.nx * norTx + nLocal.ny * binTx;
        const ny = nLocal.nx * norTy + nLocal.ny * binTy;
        const nz = nLocal.nx * norTz + nLocal.ny * binTz;

        const vi = r * VERT_COLS + c;

        pos[vi * 3 + 0] = wx;
        pos[vi * 3 + 1] = wy;
        pos[vi * 3 + 2] = wz;

        nor[vi * 3 + 0] = nx;
        nor[vi * 3 + 1] = ny;
        nor[vi * 3 + 2] = nz;
      }
    }

    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.normal.needsUpdate = true;

    this._mat.uniforms.time.value = this._time;
    this._mat.uniforms.playerGlobalS.value = playerGlobalS;
    this._mat.uniforms.playerWorldPos.value.copy(playerWorldPos);
  }

  dispose() {
    this._scene.remove(this._mesh);
    this._geo.dispose();
    this._mat.dispose();
  }
}
