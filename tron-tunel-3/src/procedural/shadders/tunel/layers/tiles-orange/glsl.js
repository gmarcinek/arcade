import c from './config.js';

export const glsl = `
        // ===== ORANGE DASH TILES — world-locked, uniform grid, always on =====
        {
          float lf = layerDepthFade(fragS, uDepthTilesOrange);
          float le = layerEmerge(fragS);

          float tileAngA = angle01 * ${c.colsA}.0;
          float tileSA   = fragS * ${c.densityA} - time * (${c.speedA} + 1.5);
          float tileA    = softDash(tileAngA, tileSA, ${c.awA}, ${c.swA});

          float tileAngB = angle01 * ${c.colsB}.0 + ${c.phaseB};
          float tileSB   = fragS * ${c.densityB} + time * ${c.speedB};
          float tileB    = softDash(tileAngB, tileSB, ${c.awB}, ${c.swB});

          orangeTiles = max(tileA * (0.65 + uBassImpact), tileB * 0.70);

          col += orangeTiles * uDashOrange   * lf * le * uOpTilesOrange * (0.55 + uBassImpact * 1.25);
          col += orangeTiles * uLavaColorHot * lf * le * uOpTilesOrange * uOnsetPulse * 0.75;
        }
`;
