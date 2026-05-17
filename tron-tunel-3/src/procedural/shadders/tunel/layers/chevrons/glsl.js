import c from './config.js';

export const glsl = `
        // ===== FLOOR CHEVRONS — close layer =====
        {
          vec2 lc = layerCoord(
            angle01, fragS, uDepthChevrons,
            0.25, 1.50, uBeatPulse, 1.65, 15.0, 0.20
          );

          float s  = lc.y;
          float lf = layerDepthFade(s, uDepthChevrons);
          float le = layerEmerge(s);

          float ground = smoothstep(${c.groundEdge}, 0.0, absAngle);
          float diagA  = softLine(s * ${c.slope} + lc.x * 2.0 - time * ${c.speed}, ${c.lineWidth});
          float diagB  = softLine(s * ${c.slope} - lc.x * 2.0 - time * ${c.speed} + 0.5, ${c.lineWidth});
          float chev   = max(diagA, diagB);

          float chevronPulse = saturate(uBeatPulse * 1.1 + uOnsetPulse * 0.35 + motifA * 0.35);
          col += ground * chev * uDashOrange * lf * le * uOpChevrons * chevronPulse * ${c.gain};
        }
`;
