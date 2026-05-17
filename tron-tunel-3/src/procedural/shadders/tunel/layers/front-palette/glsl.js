import c from './config.js';

export const glsl = `
        // ===== FRONT CONTRAST-WHEEL PALETTE ACCENTS =====
        {
          vec2 lc = layerCoord(
            angle01, fragS, uDepthFrontPalette,
            1.00, -0.80, uOnsetPulse + uChromaTint.x * 0.35, 0.70, 20.6, 1.00
          );

          float s  = lc.y;
          float le = layerEmerge(s);
          float lw = 1.0 - le;
          float lf = layerDepthFade(s, uDepthFrontPalette);

          float frontMask = smoothstep(0.25, 0.95, lw)
                          * (1.0 - smoothstep(0.96, 1.00, lw));

          float palT  = fract(time * 0.040 + fbm1(s / 160.0) + uChromaTint.x * 0.12);
          vec3 accent = pickFrontAccent(palT);

          float frontRibbonA = softLine(lc.x * ${c.colsA}.0 + s * 0.028 + time * 0.16, ${c.widthA});
          float frontRibbonB = softLine(lc.x * ${c.colsB}.0 - s * 0.022 - time * 0.13 + 0.31, ${c.widthB});
          float frontDots    = softDash(lc.x * ${c.dotCols}.0, s * 0.18 + time * 0.20, ${c.dotAw}, ${c.dotSw});

          float frontLayer = max(frontRibbonA * 0.80, max(frontRibbonB * 0.55, frontDots * 0.65));
          frontLayer *= saturate(0.20 + uOpFrontPalette + uOnsetPulse * 0.65 + uBeatPulse * 0.30);

          col += accent * frontLayer * frontMask * lf * uOpFrontPalette * 0.90;
        }
`;
