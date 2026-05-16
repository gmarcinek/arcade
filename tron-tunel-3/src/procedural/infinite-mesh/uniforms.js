import { sourceValue, signedSourceValue } from './audio-utils.js';
import { evalOpacity } from './opacity.js';
import { TUNNEL_FX_CONFIG } from './config.js';

// --- Audio uniforms ---------------------------------------------------------
// Reads AudioMetadataBus snapshot, pushes the per-band values to the shader,
// and runs the silence-grid lerp.
//
// `state` is the InfiniteMesh instance (or any object with a mutable
// `_silenceGrid` field). silenceGrid fades toward 0 as music energy rises and
// back to 1 in silence — gated by a slow exponential so the transition is
// gradual (~2 sec).

export function syncAudioUniforms(uniforms, audio, state, dt) {
  const chroma = Array.isArray(audio?.chroma) ? audio.chroma : [0, 0, 0];

  uniforms.uSubBass.value     = sourceValue(audio, 'sub');
  uniforms.uBass.value        = sourceValue(audio, 'low');
  uniforms.uMid.value         = sourceValue(audio, 'mid');
  uniforms.uTreble.value      = sourceValue(audio, 'high');
  uniforms.uBassImpact.value  = sourceValue(audio, 'bassImpact');
  uniforms.uMidWave.value     = sourceValue(audio, 'midWave');
  uniforms.uLavaLight.value   = sourceValue(audio, 'lavaLight');
  uniforms.uRibbonDrive.value = sourceValue(audio, 'ribbonDrive');
  uniforms.uOnsetPulse.value  = sourceValue(audio, 'onsetPulse');
  uniforms.uBeatPulse.value   = sourceValue(audio, 'beatPulse');
  uniforms.uMusicEnergy.value = sourceValue(audio, 'rms');

  uniforms.uChromaTint.value.set(
    Number.isFinite(chroma[0]) ? chroma[0] : 0,
    Number.isFinite(chroma[1]) ? chroma[1] : 0,
    Number.isFinite(chroma[2]) ? chroma[2] : 0,
  );

  // Silence grid: fades out as music energy rises, fades in when silent.
  // Slow lerp so transition is gradual (~2 sec).
  const rms = sourceValue(audio, 'rms');
  const silenceTarget = 1.0 - Math.min(1.0, rms * 4.0); // goes to 0 above rms=0.25
  if (state._silenceGrid === undefined) state._silenceGrid = 1.0;
  state._silenceGrid += (silenceTarget - state._silenceGrid) * (1.0 - Math.exp(-dt * 0.6));
  uniforms.uSilenceGrid.value = Math.max(0, state._silenceGrid);
}

// --- Config + parallax + global brightness ----------------------------------
// Pushes TUNNEL_FX_CONFIG into the shader each frame so live edits to the
// config object take effect without rebuilding the material.

export function syncConfigUniforms(uniforms, audio, time) {
  const cfg = TUNNEL_FX_CONFIG;
  const p = cfg.parallax;
  const d = p.layerDepth;

  uniforms.uFxBass.value     = cfg.fxBass;
  uniforms.uFxBeat.value     = cfg.fxBeat;
  uniforms.uFxOnset.value    = cfg.fxOnset;
  uniforms.uFxMid.value      = cfg.fxMid;
  uniforms.uFxEnergy.value   = cfg.fxEnergy;
  uniforms.uEmergeDist.value = cfg.emergeDist;

  uniforms.uParallaxAmount.value       = p.amount;
  uniforms.uParallaxFlow.value         = p.flow;
  uniforms.uParallaxDepthStretch.value = p.depthStretch;
  uniforms.uParallaxAudioPush.value    = p.audioPush;

  const audioDeltaA = signedSourceValue(audio, ['parallaxDeltaA', 'deltaA'], 0);
  const audioDeltaS = signedSourceValue(audio, ['parallaxDeltaS', 'deltaS'], 0);

  uniforms.uParallaxDeltaA.value = Math.max(-1, Math.min(1, (p.deltaA ?? 0) + audioDeltaA));
  uniforms.uParallaxDeltaS.value = Math.max(-1, Math.min(1, (p.deltaS ?? 0) + audioDeltaS));

  uniforms.uDepthBgFlares.value     = d.bgFlares;
  uniforms.uDepthLava.value         = d.lava;
  uniforms.uDepthLavaDeep.value     = d.lavaDeep;
  uniforms.uDepthWaveform.value     = d.waveform;
  uniforms.uDepthLongBlue.value     = d.longBlue;
  uniforms.uDepthLongOrange.value   = d.longOrange;
  uniforms.uDepthTwistBlue.value    = d.twistBlue;
  uniforms.uDepthTwistOrange.value  = d.twistOrange;
  uniforms.uDepthGrid.value         = d.grid;
  uniforms.uDepthStrips.value       = d.strips;
  uniforms.uDepthTilesOrange.value  = d.tilesOrange;
  uniforms.uDepthTilesBlue.value    = d.tilesBlue;
  uniforms.uDepthChevrons.value     = d.chevrons;
  uniforms.uDepthFrontPalette.value = d.frontPalette;

  uniforms.uBaseNavy.value.set(...cfg.baseNavy);
  uniforms.uDeepNavy.value.set(...cfg.deepNavy);
  uniforms.uStructureBlue.value.set(...cfg.structureBlue);
  uniforms.uWaveformBlue.value.set(...cfg.waveformBlue);
  uniforms.uElectricBlue.value.set(...cfg.electricBlue);

  uniforms.uLavaColorDark.value.set(...cfg.lavaColorDark);
  uniforms.uLavaColorMid.value.set(...cfg.lavaColorMid);
  uniforms.uLavaColorHot.value.set(...cfg.lavaColorHot);
  uniforms.uDashOrange.value.set(...cfg.dashOrange);
  uniforms.uEdgeOrange.value.set(...cfg.edgeOrange);
  uniforms.uContactWarm.value.set(...cfg.contactWarm);

  uniforms.uAccentRed.value.set(...cfg.accentRed);
  uniforms.uAccentEmerald.value.set(...cfg.accentEmerald);
  uniforms.uAccentAfrican.value.set(...cfg.accentAfrican);
  uniforms.uAccentFuchsia.value.set(...cfg.accentFuchsia);

  // Global bright/dark cycle — 30 sec bright, 30 sec dark (60 sec full cycle).
  const brightOsc = 0.5 + 0.5 * Math.sin((time * Math.PI * 2.0) / (cfg.brightCyclePeriod ?? 60.0));
  const brightVal = (cfg.brightMin ?? 0.18) + ((cfg.brightMax ?? 1.0) - (cfg.brightMin ?? 0.18)) * brightOsc;
  uniforms.uGlobalBright.value = brightVal;
}

// --- Per-layer opacity ------------------------------------------------------
// Runs evalOpacity for each tracked layer and writes the result to its uniform.

export function syncOpacityUniforms(uniforms, audio, dt, opSmooth, time) {
  uniforms.uOpGrid.value         = evalOpacity('grid',         audio, dt, opSmooth, time);
  uniforms.uOpWaveform.value     = evalOpacity('waveform',     audio, dt, opSmooth, time);
  uniforms.uOpLava.value         = evalOpacity('lava',         audio, dt, opSmooth, time);
  uniforms.uOpLavaDeep.value     = evalOpacity('lavaDeep',     audio, dt, opSmooth, time);
  uniforms.uOpStrips.value       = evalOpacity('strips',       audio, dt, opSmooth, time);
  uniforms.uOpLongBands.value    = evalOpacity('longBands',    audio, dt, opSmooth, time);
  uniforms.uOpTwistBands.value   = evalOpacity('twistBands',   audio, dt, opSmooth, time);
  uniforms.uOpTilesOrange.value  = evalOpacity('tilesOrange',  audio, dt, opSmooth, time);
  uniforms.uOpTilesBlue.value    = evalOpacity('tilesBlue',    audio, dt, opSmooth, time);
  uniforms.uOpChevrons.value     = evalOpacity('chevrons',     audio, dt, opSmooth, time);
  uniforms.uOpFloorEdge.value    = evalOpacity('floorEdge',    audio, dt, opSmooth, time);
  uniforms.uOpContact.value      = evalOpacity('contact',      audio, dt, opSmooth, time);
  uniforms.uOpBgFlares.value     = evalOpacity('bgFlares',     audio, dt, opSmooth, time);
  uniforms.uOpFrontPalette.value = evalOpacity('frontPalette', audio, dt, opSmooth, time);
}
