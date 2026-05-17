import c from './config.js';

export const glsl = `
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

          float s  = lc.y;
          float lf = layerDepthFade(s, uDepthTilesBlue);
          float le = layerEmerge(s);

          float tileAng2 = lc.x * (${c.colsBase}.0 + segHash * ${c.colsVar}.0) + 0.17;
          float tileS2   = s * (${c.densityBase} + segHash2 * ${c.densityVar}) - time * 0.22;
          float tile2    = softDash(tileAng2, tileS2, ${c.aw}, ${c.sw});

          float tinySpark = softDash(lc.x * ${c.sparkCols}.0 + segHash, s * ${c.sparkDensity} + time * 0.9, ${c.sparkAw}, ${c.sparkSw});
          float trebleAppear = saturate(0.25 + uTreble * 0.90 + uOnsetPulse * 0.30);

          col += tile2     * uStructureBlue * lf * le * uOpTilesBlue * trebleAppear * (${c.baseGain} + motifC);
          col += tinySpark * uElectricBlue  * lf * le * uOpTilesBlue * uTreble * 0.65;
        }
`;
