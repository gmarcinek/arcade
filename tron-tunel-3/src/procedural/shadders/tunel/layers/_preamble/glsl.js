import c from './config.js';
import { f } from '../glsl-utils.js';

export const glsl = `
      void main() {
        float angle    = (vUv.x * 2.0 - 1.0) * PI;
        float absAngle = abs(angle);
        float angle01  = vUv.x;

        float fragS = playerGlobalS - behindDist + vUv.y * totalLen;

        float dS        = abs(fragS - playerGlobalS);
        float depthFade = ${c.depthFadeBase} + ${c.depthFadeRange} * exp(-dS * ${c.depthFadeRate});

        float aheadDist = fragS - playerGlobalS;
        float emerge = aheadDist > 0.0
          ? 1.0 - smoothstep(0.0, uEmergeDist, aheadDist)
          : 1.0;

        float waveFade = 1.0 - emerge;

        float segHash  = fbm1(fragS / ${f(c.segHashPeriod)});
        float segHash2 = fbm1(fragS / ${f(c.segHashPeriod)} + 31.7);

        float motifA = motifGate(fragS, 0.42, 0.0);
        float motifB = motifGate(fragS + 44.0, 0.37, 2.4);
        float motifC = motifGate(fragS - 27.0, 0.51, 5.2);

        float beatAppear  = saturate(0.20 + uBeatPulse * 0.90 + uOnsetPulse * 0.65);
        float musicDrive  = saturate(uMusicEnergy * 1.25 + uBassImpact * 0.35);
        float ribbonDrive = saturate(uRibbonDrive + uMidWave * 0.45 + uBeatPulse * 0.25);

        // Dark navy / black base.
        vec3 col = uBaseNavy;
        float innerSheen = pow(max(0.0, 1.0 - absAngle * 0.78), 3.2);
        col += uDeepNavy * innerSheen * (0.35 + 0.65 * depthFade);
        col *= depthFade;

        float orangeTiles = 0.0; // filled by tiles-orange, consumed in _postamble
`;
