import * as THREE from 'three';
import { TUNNEL_R } from '../config.js';
import { AudioMetadataBus } from '../audio/AudioMetadataBus.js';

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
  shakeAmp:       0.0,
  waveAmp:        1.7,
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
    },

    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,

    fragmentShader: /* glsl */`
      #define PI 3.14159265359

      uniform float time;
      uniform float playerGlobalS;
      uniform vec3  playerWorldPos;
      uniform float behindDist;
      uniform float totalLen;

      uniform float uSubBass;
      uniform float uBass;
      uniform float uMid;
      uniform float uTreble;
      uniform float uBassImpact;
      uniform float uMidWave;
      uniform float uLavaLight;
      uniform float uRibbonDrive;
      uniform float uOnsetPulse;
      uniform float uBeatPulse;
      uniform float uMusicEnergy;
      uniform vec3  uChromaTint;

      uniform float uFxBass;
      uniform float uFxBeat;
      uniform float uFxOnset;
      uniform float uFxMid;
      uniform float uFxEnergy;
      uniform float uGlobalBright;
      uniform float uEmergeDist;

      uniform float uParallaxAmount;
      uniform float uParallaxFlow;
      uniform float uParallaxDepthStretch;
      uniform float uParallaxAudioPush;
      uniform float uParallaxDeltaA;
      uniform float uParallaxDeltaS;

      uniform float uDepthBgFlares;
      uniform float uDepthLava;
      uniform float uDepthLavaDeep;
      uniform float uDepthWaveform;
      uniform float uDepthLongBlue;
      uniform float uDepthLongOrange;
      uniform float uDepthTwistBlue;
      uniform float uDepthTwistOrange;
      uniform float uDepthGrid;
      uniform float uDepthStrips;
      uniform float uDepthTilesOrange;
      uniform float uDepthTilesBlue;
      uniform float uDepthChevrons;
      uniform float uDepthFrontPalette;

      uniform vec3 uBaseNavy;
      uniform vec3 uDeepNavy;
      uniform vec3 uStructureBlue;
      uniform vec3 uWaveformBlue;
      uniform vec3 uElectricBlue;

      uniform vec3 uLavaColorDark;
      uniform vec3 uLavaColorMid;
      uniform vec3 uLavaColorHot;
      uniform vec3 uDashOrange;
      uniform vec3 uEdgeOrange;
      uniform vec3 uContactWarm;

      uniform vec3 uAccentRed;
      uniform vec3 uAccentEmerald;
      uniform vec3 uAccentAfrican;
      uniform vec3 uAccentFuchsia;

      uniform float uOpGrid;
      uniform float uOpWaveform;
      uniform float uOpLava;
      uniform float uOpLavaDeep;
      uniform float uOpStrips;
      uniform float uOpLongBands;
      uniform float uOpTwistBands;
      uniform float uOpTilesOrange;
      uniform float uOpTilesBlue;
      uniform float uOpChevrons;
      uniform float uOpFloorEdge;
      uniform float uOpContact;
      uniform float uOpBgFlares;
      uniform float uOpFrontPalette;

      varying vec3 vWorld;
      varying vec2 vUv;

      float saturate(float x) {
        return clamp(x, 0.0, 1.0);
      }

      float hash11(float p) {
        return fract(sin(p * 127.1) * 43758.5453123);
      }

      float softLine(float x, float width) {
        float d = abs(fract(x) - 0.5);
        return 1.0 - smoothstep(0.0, width, d);
      }

      float softDash(float a, float s, float aw, float sw) {
        float da = abs(fract(a) - 0.5);
        float ds = abs(fract(s) - 0.5);
        float ma = 1.0 - smoothstep(aw, aw + 0.035, da);
        float ms = 1.0 - smoothstep(sw, sw + 0.055, ds);
        return ma * ms;
      }

      float motifGate(float fragS, float speed, float phase) {
        float seg = floor(fragS / 92.0);
        float n = hash11(seg + phase * 17.0);
        float w = 0.5 + 0.5 * sin(time * speed + seg * 1.91 + phase + n * 6.283);
        float beat = saturate(uBeatPulse * 0.65 + uOnsetPulse * 0.45 + uMusicEnergy * 0.25);
        return smoothstep(0.42, 0.88, w + beat * 0.42);
      }

      vec2 layerCoord(
        float baseA,
        float baseS,
        float depth,
        float aDir,
        float sDir,
        float audio,
        float flowSpeed,
        float seed,
        float deltaMix
      ) {
        float rel = baseS - playerGlobalS;
        float audioSigned = (saturate(audio) - 0.5) * 2.0;

        float slowA = sin(time * (0.13 + flowSpeed * 0.09) + rel * 0.006 + seed);
        float slowS = sin(time * (0.07 + flowSpeed * 0.05) + rel * 0.003 + seed * 1.731);

        float a =
          baseA
          + depth * uParallaxAmount * (
              aDir * (slowA * 0.018 + audioSigned * 0.020 * uParallaxAudioPush)
              + uParallaxDeltaA * 0.160 * deltaMix
            );

        float s =
          baseS
          + depth * uParallaxAmount * (
              sDir * (time * flowSpeed * 6.0 * uParallaxFlow + audioSigned * 38.0 * uParallaxAudioPush)
              + slowS * 18.0 * uParallaxDepthStretch
              + uParallaxDeltaS * 82.0 * deltaMix
            );

        return vec2(a, s);
      }

      float layerDepthFade(float s, float depth) {
        float d = abs(s - playerGlobalS);
        float k = 0.0085 + abs(depth) * 0.0018;
        return 0.55 + 0.45 * exp(-d * k);
      }

      float layerEmerge(float s) {
        float ahead = s - playerGlobalS;
        return ahead > 0.0
          ? 1.0 - smoothstep(0.0, uEmergeDist, ahead)
          : 1.0;
      }

      vec3 pickFrontAccent(float t) {
        float w0 = max(0.0, 1.0 - abs(t - 0.16) / 0.24);
        float w1 = max(0.0, 1.0 - abs(t - 0.50) / 0.24);
        float w2 = max(0.0, 1.0 - abs(t - 0.84) / 0.24);
        float sumW = max(0.001, w0 + w1 + w2);

        vec3 redEmerald = mix(uAccentRed, uAccentEmerald, 0.45 + 0.25 * sin(time * 0.23));
        vec3 goldFuchsia = mix(uAccentAfrican, uAccentFuchsia, 0.50 + 0.25 * sin(time * 0.19 + 2.1));
        vec3 orangeBlue = mix(uLavaColorHot, uElectricBlue, 0.25 + 0.30 * sin(time * 0.17 + 4.0));

        return (redEmerald * w0 + goldFuchsia * w1 + orangeBlue * w2) / sumW;
      }

      void main() {
        float angle    = (vUv.x * 2.0 - 1.0) * PI;
        float absAngle = abs(angle);
        float angle01  = vUv.x;

        float fragS = playerGlobalS - behindDist + vUv.y * totalLen;

        float dS        = abs(fragS - playerGlobalS);
        float depthFade = 0.58 + 0.42 * exp(-dS * 0.0085);

        float aheadDist = fragS - playerGlobalS;
        float emerge = aheadDist > 0.0
          ? 1.0 - smoothstep(0.0, uEmergeDist, aheadDist)
          : 1.0;

        float waveFade = 1.0 - emerge;

        float seg      = floor(fragS / 92.0);
        float segHash  = hash11(seg);
        float segHash2 = hash11(seg + 31.7);

        float motifA = motifGate(fragS, 0.42, 0.0);
        float motifB = motifGate(fragS + 44.0, 0.37, 2.4);
        float motifC = motifGate(fragS - 27.0, 0.51, 5.2);

        float beatAppear  = saturate(0.20 + uBeatPulse * 0.90 + uOnsetPulse * 0.65);
        float musicDrive  = saturate(uMusicEnergy * 1.25 + uBassImpact * 0.35);
        float ribbonDrive = saturate(uRibbonDrive + uMidWave * 0.45 + uBeatPulse * 0.25);

        // Dark navy / black base.
        vec3 col = uBaseNavy;
        float innerSheen = pow(max(0.0, 1.0 - absAngle * 0.78), 3.2);
        col += uDeepNavy * innerSheen * (0.35 + 0.65 * depthFade);
        col *= depthFade;

        // ===== DEEP BACKGROUND AUDIO FLARES =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthBgFlares,
            -1.0,
            -1.0,
            uMusicEnergy,
            0.24,
            1.3,
            0.85
          );

          float a = (lc.x * 2.0 - 1.0) * PI;
          float s = lc.y;
          float lf = layerDepthFade(s, uDepthBgFlares);
          float le = layerEmerge(s);
          float lw = 1.0 - le;

          float f1 = sin(a * 0.57 + s * 0.010 + time * 0.09);
          float f2 = sin(a * 1.23 - s * 0.006 - time * 0.07);
          float f3 = sin(a * 2.10 + s * 0.004 + time * 0.05 + segHash * 6.283);

          float raw = (f1 * 0.5 + 0.5) * (f2 * 0.5 + 0.5);
          raw = max(raw, (f3 * 0.5 + 0.5) * 0.55);

          float flare = pow(smoothstep(0.30, 0.95, raw), 1.35);
          float distMask = smoothstep(0.0, 0.30, lw)
                         * (1.0 - 0.35 * smoothstep(0.82, 1.0, lw));

          vec3 flareColor = mix(uLavaColorMid, uElectricBlue, 0.25 + 0.35 * sin(time * 0.16 + s * 0.003));
          col += flare * distMask * flareColor * uOpBgFlares * (0.35 + musicDrive * 0.55) * lf;
        }

        // ===== ORANGE LAVA / MOLTEN PATCHES =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthLava,
            0.55,
            1.0,
            uLavaLight + uBass * 0.35,
            0.55,
            2.1,
            0.30
          );

          vec2 ld = layerCoord(
            angle01,
            fragS,
            uDepthLavaDeep,
            -0.35,
            -0.55,
            uBass,
            0.18,
            7.7,
            0.15
          );

          float a = (lc.x * 2.0 - 1.0) * PI;
          float s = lc.y;
          float ad = (ld.x * 2.0 - 1.0) * PI;
          float sd = ld.y;

          float lf = layerDepthFade(s, uDepthLava);
          float le = layerEmerge(s);
          float ldf = layerDepthFade(sd, uDepthLavaDeep);
          float lde = layerEmerge(sd);

          float lv1 =
              sin(a * 1.30 + s * 0.073 + time * 0.18) * 0.42
            + sin(a * 2.70 - s * 0.051 + time * 0.11) * 0.34
            + sin(a * 0.75 + s * 0.034 - time * 0.15) * 0.31
            + sin(a * 4.90 - s * 0.019 + time * 0.06 + segHash * 3.1) * 0.23;

          float lv2 =
              sin(ad * 1.85 - sd * 0.095 - time * 0.13) * 0.38
            + sin(ad * 3.25 + sd * 0.045 + time * 0.15) * 0.30
            + sin(ad * 5.50 - sd * 0.027 + time * 0.08) * 0.21;

          float r1 = lv1 * 0.5 + 0.5;
          float r2 = lv2 * 0.5 + 0.5;

          float blob1 = smoothstep(0.28, 0.76, r1);
          float blob2 = smoothstep(0.32, 0.82, r2);
          float hot1  = smoothstep(0.68, 0.95, r1);
          float hot2  = smoothstep(0.70, 0.96, r2);

          float readable = 0.58 + 0.42 * pow(max(0.0, 1.0 - absAngle * 0.42), 2.0);
          float lavaPulse = 0.55 + 0.45 * sin(time * 0.22 + s * 0.010 + segHash * 6.283);
          lavaPulse = saturate(lavaPulse * 0.65 + uLavaLight * 0.65 + uBass * 0.35);

          vec3 lavaCol =
              uLavaColorDark * blob1 * 0.52
            + uLavaColorMid  * blob2 * 0.48
            + uLavaColorHot  * (hot1 + hot2) * 0.38;

          lavaCol = mix(lavaCol, lavaCol + uChromaTint * 0.35, uMusicEnergy * 0.35);

          col += lavaCol * readable * lf * le * uOpLava * lavaPulse;
          col += uLavaColorDark * (blob1 * 0.65 + blob2 * 0.45)
               * ldf * lde * uOpLavaDeep * (0.45 + uBass * 0.75);
        }

        // ===== FRONT BLUE WIREFRAME / WAVEFORM =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthWaveform,
            0.35,
            -0.45,
            uMidWave,
            0.80,
            4.4,
            0.70
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthWaveform);
          float le = layerEmerge(s);
          float lw = 1.0 - le;

          float frontWire = lw * lf;
          vec3 wf = mix(uStructureBlue, uWaveformBlue, 0.55 + 0.45 * uMidWave);

          col = mix(col, wf * (0.70 + uMidWave * 1.65), frontWire * 0.70 * uOpWaveform);
          col += wf * frontWire * (0.28 + uMidWave * 1.25) * uOpWaveform;
        }

        // ===== LONGITUDINAL BLUE / ORANGE LANES =====
        {
          vec2 lb = layerCoord(
            angle01,
            fragS,
            uDepthLongBlue,
            -0.55,
            0.75,
            uRibbonDrive,
            0.95,
            8.2,
            1.00
          );

          vec2 lo = layerCoord(
            angle01,
            fragS,
            uDepthLongOrange,
            0.85,
            -0.55,
            uMid + uBeatPulse * 0.25,
            0.65,
            11.1,
            1.00
          );

          float laneCountA = mix(9.0, 17.0, segHash);
          float laneCountB = mix(5.0, 11.0, segHash2);

          float longBlue = softLine(lb.x * laneCountA + sin(lb.y * 0.018 + time * 0.17) * 0.08, 0.050);
          float longOrange = softLine(lo.x * laneCountB + 0.31 + sin(lo.y * 0.013 - time * 0.13) * 0.12, 0.038);

          float sPulse = 0.55 + 0.45 * sin(lo.y * 0.045 - time * 1.6 + segHash * 4.0);

          float fadeB = layerDepthFade(lb.y, uDepthLongBlue) * layerEmerge(lb.y);
          float fadeO = layerDepthFade(lo.y, uDepthLongOrange) * layerEmerge(lo.y);

          col += longBlue * uElectricBlue * fadeB * uOpLongBands * (0.35 + motifA * 0.75) * (0.45 + 0.55 * ribbonDrive);
          col += longOrange * uDashOrange * fadeO * uOpLongBands * (0.22 + sPulse * 0.65) * motifB * (0.45 + 0.55 * ribbonDrive);
        }

        // ===== TWISTED CROSS-RIBBONS / HELIX BANDS =====
        {
          vec2 tb = layerCoord(
            angle01,
            fragS,
            uDepthTwistBlue,
            1.00,
            0.85,
            uMidWave,
            1.25,
            13.7,
            1.00
          );

          vec2 to = layerCoord(
            angle01,
            fragS,
            uDepthTwistOrange,
            -1.00,
            -0.95,
            uBeatPulse + uMid * 0.35,
            1.05,
            17.3,
            0.80
          );

          float twistSpeedA = 0.018 + segHash * 0.025;
          float twistSpeedB = 0.030 + segHash2 * 0.035;

          float twistA = softLine(tb.x * 7.0 + tb.y * twistSpeedA + sin(tb.y * 0.011 + time * 0.34) * 0.16, 0.040);
          float twistB = softLine(to.x * 5.0 - to.y * twistSpeedB + sin(to.y * 0.015 - time * 0.28) * 0.14 + 0.27, 0.035);

          float twistPulse = 0.25 + 0.75 * saturate(uMidWave * 0.75 + uBeatPulse * 0.45 + motifC * 0.55);

          float fadeB = layerDepthFade(tb.y, uDepthTwistBlue) * layerEmerge(tb.y);
          float fadeO = layerDepthFade(to.y, uDepthTwistOrange) * layerEmerge(to.y);

          col += twistA * uElectricBlue * fadeB * uOpTwistBands * twistPulse * (0.50 + motifA);
          col += twistB * uDashOrange   * fadeO * uOpTwistBands * twistPulse * (0.32 + motifB * 0.80);
        }

        // ===== BLUE ANGULAR GRID + RING SEAMS =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthGrid,
            0.10,
            0.10,
            uMusicEnergy,
            0.10,
            3.2,
            0.00
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthGrid);
          float le = layerEmerge(s);
          float lw = 1.0 - le;

          float fineAng = softLine(lc.x * 60.0, 0.035);
          float ringA   = softLine(s * 0.125, 0.040);
          float ringB   = softLine(s * 0.031, 0.034);

          float beatRing = 0.55 + uBeatPulse * uFxBeat * 2.35 + uMidWave * 0.80;
          vec3 ringColor = mix(uStructureBlue, uWaveformBlue, lw * 0.85);

          col += fineAng * uStructureBlue * lf * le * uOpGrid * (0.16 + beatRing * 0.20);
          col += ringA   * ringColor      * lf * le * uOpGrid * (0.25 + beatRing * 0.35);
          col += ringB   * ringColor      * lf * le * uOpGrid * (0.12 + beatRing * 0.22);
        }

        // ===== ORANGE RUNNING-LIGHT STRIPS =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthStrips,
            -0.30,
            1.10,
            uMid + uOnsetPulse * 0.4,
            1.45,
            5.8,
            0.55
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthStrips);
          float le = layerEmerge(s);

          float stripA = softLine(lc.x * 4.0 + 0.04 * sin(s * 0.025), 0.045);
          float stripB = softLine(lc.x * 8.0 + 0.50 + 0.03 * sin(s * 0.019 + time), 0.025);

          float pulseA = 0.5 + 0.5 * sin(s * 0.48 - time * 6.8);
          float pulseB = 0.5 + 0.5 * sin(s * 0.32 - time * 4.2 + 2.0);

          float strips = stripA * (0.25 + pulseA * 0.65) + stripB * (0.12 + pulseB * 0.45);
          strips *= 0.35 + uMidWave * 0.75 + uOnsetPulse * 0.40;

          col += strips * uDashOrange * lf * le * uOpStrips * (0.55 + motifA * 0.75);
        }

        // ===== ORANGE DASH TILES — foreground-ish parallax =====
        float orangeTiles = 0.0;
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthTilesOrange,
            0.70,
            1.35,
            uBassImpact + uOnsetPulse * 0.45,
            1.80,
            9.3,
            0.35
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthTilesOrange);
          float le = layerEmerge(s);

          float tileAngA = lc.x * (24.0 + segHash * 14.0) + segHash2 * 0.7;
          float tileSA   = s * (0.105 + segHash * 0.065) - time * (0.38 + uBassImpact * 1.2);
          float tileA    = softDash(tileAngA, tileSA, 0.070, 0.145);

          float tileAngB = lc.x * (34.0 + segHash2 * 18.0) + 0.33;
          float tileSB   = s * (0.180 + segHash * 0.040) + time * 0.18;
          float tileB    = softDash(tileAngB, tileSB, 0.052, 0.105);

          float tileAppear = saturate(beatAppear * 0.85 + motifB * 0.55);
          orangeTiles = max(tileA * (0.65 + uBassImpact), tileB * 0.70) * tileAppear;

          col += orangeTiles * uDashOrange * lf * le * uOpTilesOrange * (0.55 + uBassImpact * 1.25);
          col += orangeTiles * uLavaColorHot * lf * le * uOpTilesOrange * uOnsetPulse * 0.75;
        }

        // ===== BLUE SECONDARY TILES / TREBLE SPARKS =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthTilesBlue,
            -0.80,
            -1.10,
            uTreble + uOnsetPulse * 0.25,
            1.35,
            12.4,
            0.25
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthTilesBlue);
          float le = layerEmerge(s);

          float tileAng2 = lc.x * (42.0 + segHash * 18.0) + 0.17;
          float tileS2   = s * (0.210 + segHash2 * 0.070) - time * 0.22;
          float tile2    = softDash(tileAng2, tileS2, 0.040, 0.090);

          float tinySpark = softDash(lc.x * 95.0 + segHash, s * 0.33 + time * 0.9, 0.020, 0.050);
          float trebleAppear = saturate(0.25 + uTreble * 0.90 + uOnsetPulse * 0.30);

          col += tile2 * uStructureBlue * lf * le * uOpTilesBlue * trebleAppear * (0.35 + motifC);
          col += tinySpark * uElectricBlue * lf * le * uOpTilesBlue * uTreble * 0.65;
        }

        // ===== FLOOR CHEVRONS — close layer =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthChevrons,
            0.25,
            1.50,
            uBeatPulse,
            1.65,
            15.0,
            0.20
          );

          float s = lc.y;
          float lf = layerDepthFade(s, uDepthChevrons);
          float le = layerEmerge(s);

          float ground = smoothstep(0.68, 0.0, absAngle);
          float diagA = softLine(s * 0.095 + lc.x * 2.0 - time * 1.8, 0.060);
          float diagB = softLine(s * 0.095 - lc.x * 2.0 - time * 1.8 + 0.5, 0.060);
          float chev = max(diagA, diagB);

          float chevronPulse = saturate(uBeatPulse * 1.1 + uOnsetPulse * 0.35 + motifA * 0.35);
          col += ground * chev * uDashOrange * lf * le * uOpChevrons * chevronPulse * 0.65;
        }

        // ===== SHARP HOT ORANGE FLOOR / EDGE LINES — anchored, no parallax =====
        {
          float uvEdge = min(vUv.x, 1.0 - vUv.x);

          float knife = 1.0 - smoothstep(0.000, 0.010, uvEdge);
          float glow1 = 1.0 - smoothstep(0.000, 0.045, uvEdge);
          float glow2 = 1.0 - smoothstep(0.000, 0.125, uvEdge);

          float edgePulse = 0.75 + 0.25 * sin(time * 0.9 + fragS * 0.03);
          edgePulse += uBeatPulse * 0.55 + uOnsetPulse * 0.35;

          col += knife * uEdgeOrange    * 6.00 * depthFade * emerge * uOpFloorEdge;
          col += glow1 * uLavaColorHot  * 1.90 * depthFade * emerge * uOpFloorEdge * edgePulse;
          col += glow2 * uLavaColorMid  * 0.38 * depthFade * emerge * uOpFloorEdge * edgePulse;
        }

        // ===== FRONT CONTRAST-WHEEL PALETTE ACCENTS =====
        {
          vec2 lc = layerCoord(
            angle01,
            fragS,
            uDepthFrontPalette,
            1.00,
            -0.80,
            uOnsetPulse + uChromaTint.x * 0.35,
            0.70,
            20.6,
            1.00
          );

          float s = lc.y;
          float le = layerEmerge(s);
          float lw = 1.0 - le;
          float lf = layerDepthFade(s, uDepthFrontPalette);

          float frontMask = smoothstep(0.25, 0.95, lw)
                          * (1.0 - smoothstep(0.96, 1.00, lw));

          float palT = fract(time * 0.040 + floor(s / 160.0) * 0.333 + uChromaTint.x * 0.12);
          vec3 accent = pickFrontAccent(palT);

          float frontRibbonA = softLine(lc.x * 9.0 + s * 0.028 + time * 0.16, 0.042);
          float frontRibbonB = softLine(lc.x * 13.0 - s * 0.022 - time * 0.13 + 0.31, 0.030);
          float frontDots    = softDash(lc.x * 52.0, s * 0.18 + time * 0.20, 0.045, 0.075);

          float frontLayer = max(frontRibbonA * 0.80, max(frontRibbonB * 0.55, frontDots * 0.65));
          frontLayer *= saturate(0.20 + uOpFrontPalette + uOnsetPulse * 0.65 + uBeatPulse * 0.30);

          col += accent * frontLayer * frontMask * lf * uOpFrontPalette * 0.90;
        }

        // ===== CONTACT GLOW AROUND BALL — world anchored, no parallax =====
        {
          vec3  toPlayer = vWorld - playerWorldPos;
          float distSq   = dot(toPlayer, toPlayer);

          float nearMask = exp(-distSq * 0.050);
          float wideMask = exp(-distSq * 0.017);

          float shimmer =
              sin(fragS * 2.2 + angle * 18.0 + time * 3.5) * 0.5
            + sin(fragS * 4.7 - angle * 11.0 - time * 2.1) * 0.5;

          shimmer = 0.82 + 0.18 * shimmer;

          col += wideMask * uElectricBlue * 0.28 * depthFade * emerge * uOpContact;
          col += wideMask * uContactWarm * 0.35 * depthFade * emerge * uOpContact;
          col += nearMask * uContactWarm
               * (1.15 + uOnsetPulse * uFxOnset * 2.20)
               * shimmer * depthFade * emerge * uOpContact;

          col += exp(-distSq * 0.13) * vec3(1.00, 0.78, 0.42)
               * 1.15 * depthFade * emerge * uOpContact;
        }

        // Controlled bloom gain.
        col *= (1.0 + uMusicEnergy * uFxEnergy * 0.38);
        col += orangeTiles * uLavaColorHot * depthFade * emerge * uOpTilesOrange * 0.20;

        // Slight blue/orange contrast shaping.
        col = mix(col, col * vec3(1.08, 0.94, 0.86), saturate(uBass * 0.22));
        col = mix(col, col + uElectricBlue * 0.10, saturate(uTreble * 0.18));

        col *= uGlobalBright;
        col = min(col, vec3(4.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export class InfiniteMesh {
  constructor(scene, spline, crossSection) {
    this._scene  = scene;
    this._spline = spline;
    this._cs     = crossSection;
    this._time   = 0;
    this._opSmooth = {};
    this._build();
  }

  get material() {
    return this._mat;
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

  update(playerGlobalS, playerWorldPos, dt) {
    this._time += dt;

    const cfg = TUNNEL_FX_CONFIG;
    const audio = AudioMetadataBus.get();
    const EMERGE_DIST = cfg.emergeDist;

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
          cx * radiusFactor * norTx +
          cy * radiusFactor * binTx +
          dispN * norTx +
          dispB * binTx;

        const wy =
          f.pos.y +
          cx * radiusFactor * norTy +
          cy * radiusFactor * binTy +
          dispN * norTy +
          dispB * binTy;

        const wz =
          f.pos.z +
          cx * radiusFactor * norTz +
          cy * radiusFactor * binTz +
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