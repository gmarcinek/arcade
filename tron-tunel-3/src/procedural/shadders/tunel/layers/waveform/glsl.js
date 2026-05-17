import c from './config.js';

export const glsl = `
        // ===== FRONT BLUE WIREFRAME / WAVEFORM =====
        {
          vec2 lc = layerCoord(
            angle01, fragS, uDepthWaveform,
            0.35, -0.45, uMidWave, 0.80, 4.4, 0.70
          );

          float s  = lc.y;
          float lf = layerDepthFade(s, uDepthWaveform);
          float le = layerEmerge(s);
          float lw = 1.0 - le;

          float frontWire = lw * lf;
          vec3 wf = mix(uStructureBlue, uWaveformBlue, 0.55 + 0.45 * uMidWave);

          col  = mix(col, wf * (0.70 + uMidWave * ${c.midDriveBlend}), frontWire * ${c.blendStrength} * uOpWaveform);
          col += wf * frontWire * (${c.addStrength} + uMidWave * ${c.midDriveAdd}) * uOpWaveform;
        }
`;
