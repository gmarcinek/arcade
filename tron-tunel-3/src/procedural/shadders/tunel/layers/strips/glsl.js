import c from './config.js';

export const glsl = `
        // ===== ORANGE RUNNING-LIGHT STRIPS — world-locked =====
        {
          float lf = layerDepthFade(fragS, uDepthStrips);
          float le = layerEmerge(fragS);

          float stripA = softLine(angle01 * ${c.colsA}.0 + 0.04 * sin(fragS * 0.025), ${c.widthA});
          float stripB = softLine(angle01 * ${c.colsB}.0 + ${c.phaseB} + 0.03 * sin(fragS * 0.019 + time), ${c.widthB});

          float pulseA = 0.5 + 0.5 * sin(fragS * 0.48 - time * ${c.speedA});
          float pulseB = 0.5 + 0.5 * sin(fragS * 0.32 - time * ${c.speedB} + 2.0);

          float strips = stripA * (0.25 + pulseA * 0.65) + stripB * (0.12 + pulseB * 0.45);
          strips *= 0.35 + uMidWave * 0.75 + uOnsetPulse * 0.40;

          col += strips * uDashOrange * lf * le * uOpStrips * (${c.gain} + motifA * ${c.motifBoost});
        }
`;
