import c from './config.js';

export const glsl = `
        // ===== ORANGE LAVA / MOLTEN PATCHES =====
        {
          vec2 lc = layerCoord(
            angle01, fragS, uDepthLava,
            0.55, 1.0, uLavaLight + uBass * 0.35, 0.55, 2.1, 0.30
          );
          vec2 ld = layerCoord(
            angle01, fragS, uDepthLavaDeep,
            -0.35, -0.55, uBass, 0.18, 7.7, 0.15
          );

          float a  = (lc.x * 2.0 - 1.0) * PI;
          float s  = lc.y;
          float ad = (ld.x * 2.0 - 1.0) * PI;
          float sd = ld.y;

          float lf  = layerDepthFade(s,  uDepthLava);
          float le  = layerEmerge(s);
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

          float readable  = 0.58 + 0.42 * pow(max(0.0, 1.0 - absAngle * 0.42), 2.0);
          float lavaPulse = 0.55 + 0.45 * sin(time * 0.22 + s * 0.010 + segHash * 6.283);
          lavaPulse = saturate(lavaPulse * 0.65 + uLavaLight * 0.65 + uBass * 0.35);

          vec3 lavaCol =
              uLavaColorDark * blob1 * ${c.blobDarkGain}
            + uLavaColorMid  * blob2 * ${c.blobMidGain}
            + uLavaColorHot  * (hot1 + hot2) * ${c.hotGain};

          lavaCol = mix(lavaCol, lavaCol + uChromaTint * 0.35, uMusicEnergy * 0.35);

          col += lavaCol * readable * lf * le * uOpLava * lavaPulse;
          col += uLavaColorDark * (blob1 * ${c.deepBlobGain} + blob2 * ${c.deepBlobMix})
               * ldf * lde * uOpLavaDeep * (${c.deepBaseLow} + uBass * ${c.deepBassGain});
        }
`;
