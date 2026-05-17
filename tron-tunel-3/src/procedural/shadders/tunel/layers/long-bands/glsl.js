import c from './config.js';

export const glsl = `
        // ===== LONGITUDINAL BLUE / ORANGE LANES =====
        {
          vec2 lb = layerCoord(
            angle01, fragS, uDepthLongBlue,
            -0.55, 0.75, uRibbonDrive, 0.95, 8.2, 1.00
          );
          vec2 lo = layerCoord(
            angle01, fragS, uDepthLongOrange,
            0.85, -0.55, uMid + uBeatPulse * 0.25, 0.65, 11.1, 1.00
          );

          float laneCountA = mix(${c.laneMinA}.0, ${c.laneMaxA}.0, segHash);
          float laneCountB = mix(${c.laneMinB}.0, ${c.laneMaxB}.0, segHash2);

          float longBlue   = softLine(lb.x * laneCountA + sin(lb.y * 0.018 + time * 0.17) * 0.08, ${c.blueWidth});
          float longOrange = softLine(lo.x * laneCountB + 0.31 + sin(lo.y * 0.013 - time * 0.13) * 0.12, ${c.orangeWidth});

          float sPulse = 0.55 + 0.45 * sin(lo.y * 0.045 - time * 1.6 + segHash * 4.0);

          float fadeB = layerDepthFade(lb.y, uDepthLongBlue)   * layerEmerge(lb.y);
          float fadeO = layerDepthFade(lo.y, uDepthLongOrange) * layerEmerge(lo.y);

          col += longBlue   * uElectricBlue * fadeB * uOpLongBands * (${c.blueBase}   + motifA * ${c.blueMotif})   * (0.45 + 0.55 * ribbonDrive);
          col += longOrange * uDashOrange   * fadeO * uOpLongBands * (${c.orangeBase} + sPulse * ${c.orangePulse}) * motifB * (0.45 + 0.55 * ribbonDrive);
        }
`;
