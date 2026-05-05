export const vertexShader = /* glsl */`
      varying vec3 vWorld;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;

export const fragmentShader = /* glsl */`
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

        // ===== SILENCE FALLBACK GRID — visible when no audio =====
        // uSilenceGrid is 1.0 with no audio, fades to 0.0 when music is present.
        if (uSilenceGrid > 0.001) {
          float sg = uSilenceGrid;
          // Fine angular lines every 1/24 of circle
          float sgAngFine = softLine(angle01 * 24.0, 0.030);
          float sgAngFine2 = softLine(angle01 * 48.0, 0.050);
          // Coarser every 1/8
          float sgAngCoarse = softLine(angle01 * 8.0, 0.022);
          // Ring seams at fixed intervals
          float sgRing = softLine(fragS * 0.10, 0.030);
          float sgRingCoarse = softLine(fragS * 0.025, 0.025);
          // Breathe: floor 0.82, amp 0.18 → range [0.64, 1.00]; faster cycle ~11s
          float sgBreathe = 0.82 + 0.18 * sin(time * 0.55 + fragS * 0.005);
          // Grid lines in navy/dark-blue, barely visible
          vec3 sgColor = mix(uDeepNavy * 3.0, uStructureBlue * 0.55, 0.50 + 0.15 * sgBreathe);
          float sgFine   = sgAngFine   * (0.44 + sgBreathe * 0.26);
          float sgFine2  = sgAngFine2  * (0.44 + sgBreathe * 0.31);
          float sgCoarse = sgAngCoarse * (0.52 + sgBreathe * 0.22);
          float sgSeam   = sgRing      * (0.55 + sgBreathe * 0.18);
          float sgSeamC  = sgRingCoarse * (0.55 + sgBreathe * 0.12);
          col += sgColor * (sgFine + sgFine2 + sgCoarse + sgSeam + sgSeamC) * depthFade * emerge * sg;
          // Faint edge glow stays visible too
          float uvEdgeSg = min(vUv.x, 1.0 - vUv.x);
          col += smoothstep(0.06, 0.0, uvEdgeSg) * uStructureBlue * 0.35 * depthFade * emerge * sg;
        }

        col *= uGlobalBright;
        col = min(col, vec3(4.2));

        // ── Ball heat glow: local point-light splash driven purely by uEdgeHeat ──
        if (uEdgeHeat > 0.005) {
          vec3  hToPlayer = vWorld - playerWorldPos;
          float hDistSq   = dot(hToPlayer, hToPlayer);
          // Wide splash: falloff radius ~8m at heat=1 → exp(-d²/64)
          float hRadius   = 24.0 + uEdgeHeat * 40.0;   // 24..64 as sq-radius
          float hWide     = exp(-hDistSq / hRadius);
          // Tight core splash for bloom-like hotspot
          float hCore     = exp(-hDistSq / (hRadius * 0.18));
          // Color: deep red → orange → yellow-white
          float h = uEdgeHeat;
          float hR = 1.0;
          float hG = h < 0.5 ? h * 0.60 : 0.30 + (h - 0.5) * 1.40;
          float hB = h < 0.7 ? 0.0 : (h - 0.7) * 0.80;
          vec3  hCol = vec3(hR, clamp(hG, 0.0, 1.0), clamp(hB, 0.0, 1.0));
          float hIntensity = h * h * 1.8;
          col += hCol * hWide  * hIntensity * depthFade;
          col += hCol * hCore  * hIntensity * 2.2 * depthFade;
        }

        // ── Heat zone overlay: flat red panel, alpha 0.2 ──
        if (uHeatZoneFrac > 0.001) {
          float uvEdgeDist = min(vUv.x, 1.0 - vUv.x);  // 0 at edges, grows toward center
          float heatMask   = 1.0 - smoothstep(0.0, uHeatZoneFrac, uvEdgeDist);
          // Inner edge: sharp visible boundary with soft glow inward
          float heatEdge   = 1.0 - smoothstep(uHeatZoneFrac * 0.85, uHeatZoneFrac, uvEdgeDist);
          float heatAlpha  = 0.15 + uEdgeHeat * 0.20;
          col += vec3(0.90, 0.04, 0.02) * heatMask * heatAlpha * depthFade;
          col += vec3(1.00, 0.10, 0.02) * heatEdge * 0.30 * depthFade;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;
