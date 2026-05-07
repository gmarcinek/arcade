export const silenceGlsl = `
        // ===== SILENCE FALLBACK: GRID + JULIA =====
        // uSilenceGrid is 1.0 with no audio, fades to 0.0 when music is present.
        if (uSilenceGrid > 0.001) {
          float sg = uSilenceGrid;

          // ---- Layer A: Grid fallback ----
          float sgAngFine = softLine(angle01 * 24.0, 0.030);
          float sgAngFine2 = softLine(angle01 * 48.0, 0.050);
          float sgAngCoarse = softLine(angle01 * 8.0, 0.022);
          float sgRing = softLine(fragS * 0.10, 0.030);
          float sgRingCoarse = softLine(fragS * 0.025, 0.025);
          float sgBreathe = 0.82 + 0.18 * sin(time * 0.55 + fragS * 0.005);
          vec3 sgColor = mix(uDeepNavy * 3.0, uStructureBlue * 0.55, 0.50 + 0.15 * sgBreathe);
          float sgFine = sgAngFine * (0.44 + sgBreathe * 0.26);
          float sgFine2 = sgAngFine2 * (0.44 + sgBreathe * 0.31);
          float sgCoarse = sgAngCoarse * (0.52 + sgBreathe * 0.22);
          float sgSeam = sgRing * (0.55 + sgBreathe * 0.18);
          float sgSeamC = sgRingCoarse * (0.55 + sgBreathe * 0.12);
          col += sgColor * (sgFine + sgFine2 + sgCoarse + sgSeam + sgSeamC) * depthFade * emerge * sg;

          // ---- Layer B: Julia fractal (echophons / glslsandbox #18752) ----
          float sgTime = time;
          float sgBreath15 = 0.5 + 0.5 * sin(time * (2.0 * PI / 15.0));
          float wFractal = 0.72 * sgBreath15;
          vec2 sgZ = vec2((vUv.x - 0.5) * 3.2, (vUv.y - 0.5) * 2.0);
          float sgMX = sin(sgTime * 0.3) * sin(sgTime * 0.17) + sin(sgTime * 0.3);
          float sgMY = (1.0 - cos(sgTime * 0.632)) * sin(sgTime * 0.131) + cos(sgTime * 0.3);
          vec2 sgP = vec2(sgMX * 1.78, sgMY) * 0.5;
          float sgF = 3.0;
          float sgG = 3.0;
          for (int i = 0; i < 25; i++) {
            float d = dot(sgZ, sgZ);
            sgZ = vec2(sgZ.x, -sgZ.y) / max(d, 0.0001) + sgP * 0.5;
            sgZ.x = 1.0 - abs(sgZ.x);
            sgF = max(sgF - d, dot(sgZ - sgP, sgZ - sgP));
            sgG = min(sgG * d, sin(dot(sgZ + sgP, sgZ + sgP)) + 1.0);
          }
          sgF = abs(-log(max(abs(sgF), 0.0001)) / 3.5);
          sgG = abs(-log(max(abs(sgG), 0.0001)) / 8.0);
          vec3 sgRaw = min(vec3(sgG, sgG * sgF, sgF), vec3(1.0));
          vec3 sgFractal = mix(sgRaw * uElectricBlue * 2.2, sgRaw * vec3(0.60, 0.85, 1.0), sgRaw.b);
          col = mix(col, sgFractal, sg * wFractal * depthFade * emerge);

          // Shared faint edge glow
          float uvEdgeSg = min(vUv.x, 1.0 - vUv.x);
          col += smoothstep(0.06, 0.0, uvEdgeSg) * uStructureBlue * 0.35 * depthFade * emerge * sg;
        }
`;
