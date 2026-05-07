export const postGlsl = `
        col *= uGlobalBright;
        col = min(col, vec3(4.2));

        // ── Ball heat glow: local point-light splash driven purely by uEdgeHeat ──
        if (uEdgeHeat > 0.005) {
          vec3  hToPlayer = vWorld - playerWorldPos;
          float hDistSq   = dot(hToPlayer, hToPlayer);
          // Wide splash: falloff radius ~8m at heat=1 → exp(-d²/64)
          float hRadius   = 24.0 + uEdgeHeat * 40.0;   // 24..64 as sq-radius
          float hWide     = exp(-hDistSq / hRadius);
          // Tight core splash for bloom-like hotspot
          float hCore     = exp(-hDistSq / (hRadius * 0.18));
          // Color: deep red → orange → yellow-white
          float h = uEdgeHeat;
          float hR = 1.0;
          float hG = h < 0.5 ? h * 0.60 : 0.30 + (h - 0.5) * 1.40;
          float hB = h < 0.7 ? 0.0 : (h - 0.7) * 0.80;
          vec3  hCol = vec3(hR, clamp(hG, 0.0, 1.0), clamp(hB, 0.0, 1.0));
          float hIntensity = h * h * 1.8;
          col += hCol * hWide  * hIntensity * depthFade;
          col += hCol * hCore  * hIntensity * 2.2 * depthFade;
        }

        // ── Heat zone overlay: flat red panel, alpha 0.2 ──
        if (uHeatZoneFrac > 0.001) {
          float uvEdgeDist = min(vUv.x, 1.0 - vUv.x);  // 0 at edges, grows toward center
          float heatMask   = 1.0 - smoothstep(0.0, uHeatZoneFrac, uvEdgeDist);
          // Inner edge: sharp visible boundary with soft glow inward
          float heatEdge   = 1.0 - smoothstep(uHeatZoneFrac * 0.85, uHeatZoneFrac, uvEdgeDist);
          float heatAlpha  = 0.15 + uEdgeHeat * 0.20;
          col += vec3(0.90, 0.04, 0.02) * heatMask * heatAlpha * depthFade;
          col += vec3(1.00, 0.10, 0.02) * heatEdge * 0.30 * depthFade;
        }

        gl_FragColor = vec4(col, 1.0);
      }
`;
