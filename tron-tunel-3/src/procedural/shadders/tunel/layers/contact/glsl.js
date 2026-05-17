import c from './config.js';

export const glsl = `
        // ===== CONTACT GLOW AROUND BALL — world anchored, no parallax =====
        {
          vec3  toPlayer = vWorld - playerWorldPos;
          float distSq   = dot(toPlayer, toPlayer);

          float nearMask = exp(-distSq * ${c.nearFalloff});
          float wideMask = exp(-distSq * ${c.wideFalloff});

          float shimmer =
              sin(fragS * 2.2 + angle * 18.0 + time * 3.5) * 0.5
            + sin(fragS * 4.7 - angle * 11.0 - time * 2.1) * 0.5;

          shimmer = 0.82 + 0.18 * shimmer;

          col += wideMask * uElectricBlue  * ${c.wideBlue} * depthFade * emerge * uOpContact;
          col += wideMask * uContactWarm   * ${c.wideWarm} * depthFade * emerge * uOpContact;
          col += nearMask * uContactWarm
               * (${c.nearBase} + uOnsetPulse * uFxOnset * ${c.nearOnset})
               * shimmer * depthFade * emerge * uOpContact;

          col += exp(-distSq * ${c.hotFalloff}) * vec3(1.00, 0.78, 0.42)
               * ${c.hotGain} * depthFade * emerge * uOpContact;
        }
`;
