export const helpersGlsl = `
      float saturate(float x) {
        return clamp(x, 0.0, 1.0);
      }

      float hash11(float p) {
        return fract(sin(p * 127.1) * 43758.5453123);
      }

      // Smooth 1D value noise — C1-continuous, replaces floor(s/N)*hash pattern.
      float vnoise1(float s) {
        float i = floor(s);
        float f = fract(s);
        float u = f * f * (3.0 - 2.0 * f);
        return mix(hash11(i), hash11(i + 1.0), u);
      }

      // Multi-octave fbm for richer variation without discrete boundaries.
      float fbm1(float s) {
        return 0.55 * vnoise1(s)
             + 0.28 * vnoise1(s * 2.13 + 5.3)
             + 0.17 * vnoise1(s * 4.31 + 11.7);
      }

      float softLine(float x, float width) {
        float d = abs(fract(x) - 0.5);
        return 1.0 - smoothstep(0.0, width, d);
      }

      float softDash(float a, float s, float aw, float sw) {
        float da = abs(fract(a) - 0.5);
        float ds = abs(fract(s) - 0.5);
        float ma = 1.0 - smoothstep(aw, aw + 0.035, da);
        float ms = 1.0 - smoothstep(sw, sw + 0.055, ds);
        return ma * ms;
      }

      float motifGate(float fragS, float speed, float phase) {
        float t    = fragS / 92.0;
        float n    = fbm1(t + phase * 17.0);
        float w    = 0.5 + 0.5 * sin(time * speed + t * 0.6 + phase + n * 6.283);
        float beat = saturate(uBeatPulse * 0.65 + uOnsetPulse * 0.45 + uMusicEnergy * 0.25);
        return smoothstep(0.42, 0.88, w + beat * 0.42);
      }

      vec2 layerCoord(
        float baseA,
        float baseS,
        float depth,
        float aDir,
        float sDir,
        float audio,
        float flowSpeed,
        float seed,
        float deltaMix
      ) {
        float rel = baseS - playerGlobalS;
        float audioSigned = (saturate(audio) - 0.5) * 2.0;

        float slowA = sin(time * (0.13 + flowSpeed * 0.09) + rel * 0.006 + seed);
        float slowS = sin(time * (0.07 + flowSpeed * 0.05) + rel * 0.003 + seed * 1.731);

        float a =
          baseA
          + depth * uParallaxAmount * (
              aDir * (slowA * 0.018 + audioSigned * 0.020 * uParallaxAudioPush)
              + uParallaxDeltaA * 0.160 * deltaMix
            );

        float s =
          baseS
          + depth * uParallaxAmount * (
              sDir * (time * flowSpeed * 6.0 * uParallaxFlow + audioSigned * 38.0 * uParallaxAudioPush)
              + slowS * 18.0 * uParallaxDepthStretch
              + uParallaxDeltaS * 82.0 * deltaMix
            );

        return vec2(a, s);
      }

      float layerDepthFade(float s, float depth) {
        float d = abs(s - playerGlobalS);
        float k = 0.0085 + abs(depth) * 0.0018;
        return 0.55 + 0.45 * exp(-d * k);
      }

      float layerEmerge(float s) {
        float ahead = s - playerGlobalS;
        return ahead > 0.0
          ? 1.0 - smoothstep(0.0, uEmergeDist, ahead)
          : 1.0;
      }

      vec3 pickFrontAccent(float t) {
        float w0 = max(0.0, 1.0 - abs(t - 0.16) / 0.24);
        float w1 = max(0.0, 1.0 - abs(t - 0.50) / 0.24);
        float w2 = max(0.0, 1.0 - abs(t - 0.84) / 0.24);
        float sumW = max(0.001, w0 + w1 + w2);

        vec3 redEmerald = mix(uAccentRed, uAccentEmerald, 0.45 + 0.25 * sin(time * 0.23));
        vec3 goldFuchsia = mix(uAccentAfrican, uAccentFuchsia, 0.50 + 0.25 * sin(time * 0.19 + 2.1));
        vec3 orangeBlue = mix(uLavaColorHot, uElectricBlue, 0.25 + 0.30 * sin(time * 0.17 + 4.0));

        return (redEmerald * w0 + goldFuchsia * w1 + orangeBlue * w2) / sumW;
      }
`;
