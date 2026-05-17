import c from './config.js';

export const glsl = `
        // ===== TWISTED CROSS-RIBBONS / HELIX BANDS =====
        {
          vec2 tb = layerCoord(
            angle01, fragS, uDepthTwistBlue,
            1.00, 0.85, uMidWave, 1.25, 13.7, 1.00
          );
          vec2 to = layerCoord(
            angle01, fragS, uDepthTwistOrange,
            -1.00, -0.95, uBeatPulse + uMid * 0.35, 1.05, 17.3, 0.80
          );

          float twistSpeedA = 0.018 + segHash  * 0.025;
          float twistSpeedB = 0.030 + segHash2 * 0.035;

          float twistA = softLine(tb.x * ${c.colsBlue}.0   + tb.y * twistSpeedA + sin(tb.y * 0.011 + time * 0.34) * 0.16, ${c.lineWidthA});
          float twistB = softLine(to.x * ${c.colsOrange}.0 - to.y * twistSpeedB + sin(to.y * 0.015 - time * 0.28) * 0.14 + 0.27, ${c.lineWidthB});

          float twistPulse = 0.25 + 0.75 * saturate(uMidWave * 0.75 + uBeatPulse * 0.45 + motifC * 0.55);

          float fadeB = layerDepthFade(tb.y, uDepthTwistBlue)   * layerEmerge(tb.y);
          float fadeO = layerDepthFade(to.y, uDepthTwistOrange) * layerEmerge(to.y);

          col += twistA * uElectricBlue * fadeB * uOpTwistBands * twistPulse * (${c.blueBase}   + motifA);
          col += twistB * uDashOrange   * fadeO * uOpTwistBands * twistPulse * (${c.orangeBase} + motifB * ${c.orangeMotif});
        }
`;
