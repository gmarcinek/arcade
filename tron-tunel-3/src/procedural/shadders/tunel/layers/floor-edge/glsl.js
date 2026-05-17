import c from './config.js';
import { f } from '../glsl-utils.js';

export const glsl = `
        // ===== SHARP HOT ORANGE FLOOR / EDGE LINES — anchored, no parallax =====
        {
          float uvEdge = min(vUv.x, 1.0 - vUv.x);

          float knife = 1.0 - smoothstep(0.000, ${c.knifeWidth}, uvEdge);
          float glow1 = 1.0 - smoothstep(0.000, ${c.glow1Width}, uvEdge);
          float glow2 = 1.0 - smoothstep(0.000, ${c.glow2Width}, uvEdge);

          float edgePulse = 0.75 + 0.25 * sin(time * 0.9 + fragS * 0.03);
          edgePulse += uBeatPulse * 0.55 + uOnsetPulse * 0.35;

          col += knife * uEdgeOrange   * ${f(c.knifeGain)} * depthFade * emerge * uOpFloorEdge;
          col += glow1 * uLavaColorHot * ${c.glow1Gain} * depthFade * emerge * uOpFloorEdge * edgePulse;
          col += glow2 * uLavaColorMid * ${c.glow2Gain} * depthFade * emerge * uOpFloorEdge * edgePulse;
        }
`;
