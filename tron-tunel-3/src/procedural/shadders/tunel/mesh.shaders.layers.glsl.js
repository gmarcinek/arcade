export const layersGlsl = `
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

        // ===== JUMP WAVES — up to 8 concurrent, each independent =====
        {
          float floorBias = exp(-absAngle * absAngle * 0.5);
          for (int _wi = 0; _wi < 8; _wi++) {
            float _age   = uJumpWaveAge[_wi];
            float _power = uJumpWavePower[_wi];
            float _front = uJumpWaveS[_wi];
            float _active = step(_age, 2.9999);        // 1 if age < 3, else 0
            float waveDist  = fragS - _front;
            float waveWidth = 5.0 + _age * 4.0;
            float ring      = exp(-waveDist * waveDist / (waveWidth * waveWidth));
            float ageFade   = max(0.0, 1.0 - _age / 3.0);
            float waveMask  = ring * ageFade * (0.40 + 0.60 * floorBias) * _active * _power;
            col += waveMask * uElectricBlue * uJumpWaveGlowBlue;
            col += waveMask * vec3(0.88, 0.96, 1.00) * uJumpWaveGlowWhite * floorBias;
          }
        }

        // Slight blue/orange contrast shaping.
        col = mix(col, col * vec3(1.08, 0.94, 0.86), saturate(uBass * 0.22));
        col = mix(col, col + uElectricBlue * 0.10, saturate(uTreble * 0.18));
`;
