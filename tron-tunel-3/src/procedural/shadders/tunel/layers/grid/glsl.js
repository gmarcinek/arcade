import c from './config.js';

export const glsl = `
        // ===== BLUE ANGULAR GRID + RING SEAMS =====
        {
          vec2 lc = layerCoord(
            angle01, fragS, uDepthGrid,
            0.10, 0.10, uMusicEnergy, 0.10, 3.2, 0.00
          );

          float s  = lc.y;
          float lf = layerDepthFade(s, uDepthGrid);
          float le = layerEmerge(s);
          float lw = 1.0 - le;

          float fineAng = softLine(lc.x * ${c.fineAngCols}.0, ${c.fineAngWidth});
          float ringA   = softLine(s * ${c.ringAFreq}, ${c.ringAWidth});
          float ringB   = softLine(s * ${c.ringBFreq}, ${c.ringBWidth});

          float beatRing = 0.55 + uBeatPulse * uFxBeat * 2.35 + uMidWave * 0.80;
          vec3 ringColor = mix(uStructureBlue, uWaveformBlue, lw * 0.85);

          col += fineAng * uStructureBlue * lf * le * uOpGrid * (${c.fineBase} + beatRing * 0.20);
          col += ringA   * ringColor      * lf * le * uOpGrid * (${c.ringABase} + beatRing * 0.35);
          col += ringB   * ringColor      * lf * le * uOpGrid * (${c.ringBBase} + beatRing * 0.22);
        }
`;
