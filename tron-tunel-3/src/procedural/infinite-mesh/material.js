import * as THREE from 'three';
import { JUMP_WAVE_CONFIG } from '../../config.js';
import { vertexShader, fragmentShader } from '../shadders/tunel/mesh.shaders.js';
import { RING_COUNT, RING_STEP, BEHIND_DIST } from './constants.js';

const TOTAL_LEN = RING_COUNT * RING_STEP;

// ShaderMaterial factory.
//
// All uniforms are declared here; their values are populated each frame by
// uniforms.js (audio/config/opacity sync), jump-waves.js (wave arrays), and
// the orchestrator (time, playerGlobalS, playerWorldPos).

export function makeMaterial() {
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

      // Jump-wave arrays (max 8 concurrent waves).
      uJumpWaveS:        { value: new Array(8).fill(-9999.0) },
      uJumpWaveAge:      { value: new Array(8).fill(99.0) },
      uJumpWavePower:    { value: new Array(8).fill(0.0) },
      uJumpWaveGlowBlue: { value: JUMP_WAVE_CONFIG.glowBlue },
      uJumpWaveGlowWhite:{ value: JUMP_WAVE_CONFIG.glowWhite },
    },

    vertexShader,
    fragmentShader,
  });
}
