import { TUNNEL_R, JUMP_WAVE_CONFIG } from '../../config.js';
import { RING_COUNT, RADIAL_SEGS, RING_STEP, BEHIND_DIST } from './constants.js';
import { TUNNEL_FX_CONFIG } from './config.js';
import { sourceValue } from './audio-utils.js';

const VERT_COLS = RADIAL_SEGS + 1;

// updateVertices
//
// Rewrites position + normal attributes for every vertex in the active band.
// Called once per frame from InfiniteMesh.update.
//
// Per-ring work:
//   - Sample the spline frame at the ring's S coordinate.
//   - Compute twist + cross-section arc span.
//   - Compute emergeFactor (rings far ahead emerge gradually from radius 0).
//   - Sum jump-wave contributions: hill+valley oscillation around each
//     wave front, plus a radial push offset.
//   - Compute audio-driven wave/shake displacement (mid + bassImpact).
//
// Per-vertex work (radial loop):
//   - Map UV column to angle, get cross-section point and normal.
//   - Transform local frame to world space.
//   - Write pos[] and nor[].

export function updateVertices({ geo, spline, cs, playerGlobalS, time, jumpWaves, audio, audioTwistOffset = 0 }) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;

  const cfg = TUNNEL_FX_CONFIG;
  const EMERGE_DIST = cfg.emergeDist;

  for (let r = 0; r <= RING_COUNT; r++) {
    const ringS = playerGlobalS - BEHIND_DIST + r * RING_STEP;
    const f = spline.getFrameAt(ringS);
    if (!f) continue;

    const arcSpan = Math.min(1.0, cs ? cs.getArcSpan(ringS) : 1.0);
    const uHalf   = arcSpan * Math.PI;
    const uCenter = Math.PI;

    const twistRot = (cs ? cs.getTwist(ringS) * Math.PI * 2 : 0) + audioTwistOffset;
    const cosT = Math.cos(twistRot);
    const sinT = Math.sin(twistRot);

    const norTx = f.nor.x * cosT + f.bin.x * sinT;
    const norTy = f.nor.y * cosT + f.bin.y * sinT;
    const norTz = f.nor.z * cosT + f.bin.z * sinT;

    const binTx = -f.nor.x * sinT + f.bin.x * cosT;
    const binTy = -f.nor.y * sinT + f.bin.y * cosT;
    const binTz = -f.nor.z * sinT + f.bin.z * cosT;

    const ahead = ringS - playerGlobalS;

    let emergeFactor;
    if (ahead <= 0) {
      emergeFactor = 1.0;
    } else {
      const t = Math.max(0, Math.min(1, ahead / EMERGE_DIST));
      emergeFactor = 1.0 - t * t * (3.0 - 2.0 * t);
    }

    const radiusFactor = 0.035 + 0.965 * emergeFactor;

    // Jump wave — hill+valley oscillation + radial push/stretch.
    let waveRadialBoost = 0.0;
    for (const w of jumpWaves) {
      const d = ringS - w.frontS;
      const envelope   = JUMP_WAVE_CONFIG.envelopeBase + w.age * JUMP_WAVE_CONFIG.envelopeGrow;
      const gaussian   = Math.exp(-(d * d) / (envelope * envelope));
      const ageFade    = Math.max(0, 1.0 - w.age / JUMP_WAVE_CONFIG.duration);

      // Hill-valley oscillation — flipped: hill arrives first (ahead of front), then valley at front.
      const oscillation = -Math.cos(d * Math.PI * 2.0 / JUMP_WAVE_CONFIG.oscillationCycle);
      const wave        = JUMP_WAVE_CONFIG.waveAmp * oscillation * gaussian * ageFade * w.power;

      // Radial push: centered pushOffset metres behind wave front — comes after valley.
      const pushWidth = JUMP_WAVE_CONFIG.pushWidthBase + w.age * JUMP_WAVE_CONFIG.pushWidthGrow;
      const dPush     = d + JUMP_WAVE_CONFIG.pushOffset;
      const push      = JUMP_WAVE_CONFIG.pushAmp * Math.exp(-(dPush * dPush) / (pushWidth * pushWidth)) * ageFade * w.power;

      waveRadialBoost += wave + push;
    }
    const effectiveRadius = radiusFactor * (1.0 + waveRadialBoost);

    const mid = sourceValue(audio, 'mid');
    const bassImpact = sourceValue(audio, 'bassImpact');

    const waveAmt   = (1.0 - emergeFactor) * mid * cfg.waveAmp * TUNNEL_R * 0.9;
    const wavePhase = ringS * 0.18 + time * 3.2;
    const waveDispN = Math.sin(wavePhase) * waveAmt;
    const waveDispB = Math.cos(wavePhase * 0.73 + 1.1) * waveAmt * 0.5;

    const shakeAmt =
      emergeFactor *
      bassImpact *
      cfg.shakeAmp *
      TUNNEL_R *
      0.12;

    const shakePhase = ringS * 3.1 + time * 14.0;
    const shakeN = Math.sin(shakePhase) * shakeAmt;
    const shakeB = Math.cos(shakePhase * 0.8 + 2.3) * shakeAmt;

    const dispN = waveDispN + shakeN;
    const dispB = waveDispB + shakeB;

    for (let c = 0; c <= RADIAL_SEGS; c++) {
      const u_ang = uCenter - uHalf + (c / RADIAL_SEGS) * 2 * uHalf;

      const { x: cx, y: cy } = cs
        ? cs.getPoint(u_ang, ringS, TUNNEL_R)
        : {
            x: TUNNEL_R * Math.cos(u_ang),
            y: TUNNEL_R * Math.sin(u_ang),
          };

      const wx =
        f.pos.x +
        cx * effectiveRadius * norTx +
        cy * effectiveRadius * binTx +
        dispN * norTx +
        dispB * binTx;

      const wy =
        f.pos.y +
        cx * effectiveRadius * norTy +
        cy * effectiveRadius * binTy +
        dispN * norTy +
        dispB * binTy;

      const wz =
        f.pos.z +
        cx * effectiveRadius * norTz +
        cy * effectiveRadius * binTz +
        dispN * norTz +
        dispB * binTz;

      const nLocal = cs
        ? cs.getBallSideNormal(u_ang, ringS, TUNNEL_R)
        : {
            nx: Math.cos(u_ang),
            ny: Math.sin(u_ang),
          };

      const nx = nLocal.nx * norTx + nLocal.ny * binTx;
      const ny = nLocal.nx * norTy + nLocal.ny * binTy;
      const nz = nLocal.nx * norTz + nLocal.ny * binTz;

      const vi = r * VERT_COLS + c;

      pos[vi * 3 + 0] = wx;
      pos[vi * 3 + 1] = wy;
      pos[vi * 3 + 2] = wz;

      nor[vi * 3 + 0] = nx;
      nor[vi * 3 + 1] = ny;
      nor[vi * 3 + 2] = nz;
    }
  }

  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
}
