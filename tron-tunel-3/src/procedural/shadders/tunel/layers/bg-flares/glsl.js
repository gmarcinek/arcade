import c from './config.js';

export const glsl = `
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

          float flare = pow(smoothstep(${c.threshLo}, ${c.threshHi}, raw), ${c.flareGamma});
          float distMask = smoothstep(0.0, 0.30, lw)
                         * (1.0 - 0.35 * smoothstep(0.82, 1.0, lw));

          vec3 flareColor = mix(uLavaColorMid, uElectricBlue, 0.25 + 0.35 * sin(time * 0.16 + s * 0.003));
          col += flare * distMask * flareColor * uOpBgFlares * (${c.brightness} + musicDrive * ${c.musicDriveGain}) * lf;
        }
`;
