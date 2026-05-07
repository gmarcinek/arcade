export const uniformsGlsl = `
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
      uniform float uSilenceGrid;
      uniform float uEmergeDist;
      uniform float uHeatZoneFrac;  // UV.x fraction from each edge that is the heat zone (0=off)
      uniform float uEdgeHeat;      // current edge heat 0..1

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
`;
