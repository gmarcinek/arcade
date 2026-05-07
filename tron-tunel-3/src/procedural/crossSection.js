import * as THREE from 'three';
import { PROC_CFG } from '../config.js';

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Curvature is procedurally generated via hash — no static sequence.

export function createCrossSection() {

  // Deterministic hash: maps integer n → float in [0,1) using mulberry32
  function hash(n) {
    let s = (n * 2654435761) >>> 0;
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ── Variable-interval segment cache ──────────────────────────────────────
  // Each channel (kappa / arc / twist) has its own segment lengths drawn from
  // [ivMin, ivMax] via the deterministic hash, so consecutive turns, arc-width
  // changes and twists are all independently timed.
  function makeSegCache(ivMin, ivMax, hashSeed) {
    const starts = [0]; // starts[i] = cumulative start position of segment i
    function segLen(i) {
      return ivMin + hash(i * hashSeed + hashSeed) * (ivMax - ivMin);
    }
    function ensureIdx(i) {
      while (starts.length <= i + 1) {
        const j = starts.length - 1;
        starts.push(starts[j] + segLen(j));
      }
    }
    function idxPhase(s) {
      // Use ivMin as a rough upper bound for initial guess, then adjust.
      let i = Math.max(0, Math.floor(s / ivMax));
      ensureIdx(i + 2);
      while (starts[i + 1] <= s) { i++; ensureIdx(i + 2); }
      while (i > 0 && starts[i] > s) { i--; }
      const len = starts[i + 1] - starts[i];
      return { idx: i, phase: (s - starts[i]) / Math.max(1, len) };
    }
    return idxPhase;
  }

  const kappaIdxPhase = makeSegCache(
    PROC_CFG.KAPPA_INTERVAL_MIN, PROC_CFG.KAPPA_INTERVAL_MAX, 17);
  const arcIdxPhase   = makeSegCache(
    PROC_CFG.ARC_INTERVAL_MIN,   PROC_CFG.ARC_INTERVAL_MAX,   31);
  const twistIdxPhase = makeSegCache(
    PROC_CFG.TWIST_INTERVAL_MIN, PROC_CFG.TWIST_INTERVAL_MAX, 53);

  function getKappa(s) {
    s = Math.max(0, s);
    const { idx, phase } = kappaIdxPhase(s);
    const kMin = PROC_CFG.KAPPA_MIN, kMax = PROC_CFG.KAPPA_MAX;
    const kA = idx === 0 ? kMax : idx === 1 ? kMax : kMin + hash(idx * 13 + 1)       * (kMax - kMin);
    const kB = idx === 0 ? kMax :              kMin + hash((idx + 1) * 13 + 1) * (kMax - kMin);
    const k = kA + (kB - kA) * smoothstep(0, 1, phase);
    return Math.max(-1, Math.min(1, k));
  }

  function getArcSpan(s) {
    s = Math.max(0, s);
    const { idx, phase } = arcIdxPhase(s);
    const arcMin = PROC_CFG.ARC_MIN, arcMax = PROC_CFG.ARC_MAX;
    const wA = idx === 0 ? arcMax : idx === 1 ? arcMax : arcMin + hash(idx)     * (arcMax - arcMin);
    const wB = idx === 0 ? arcMax :              arcMin + hash(idx + 1) * (arcMax - arcMin);
    return wA + (wB - wA) * smoothstep(0, 1, phase);
  }

  function getTwist(s) {
    s = Math.max(0, s);
    const { idx, phase } = twistIdxPhase(s);
    const tA = idx === 0 ? 0 : idx === 1 ? 0 : (hash(idx * 7 + 3)       - 0.5) * 1.0;
    const tB = idx === 0 ? 0 :                  (hash((idx + 1) * 7 + 3) - 0.5) * 1.0;
    return tA + (tB - tA) * smoothstep(0, 1, phase);
  }

  // u ∈ [0, 2π] → arc-distance l from ball contact point (u=π → l=0)
  // Negated so winding matches original (u=π/2 = right side)
  function uToL(u, R) {
    // No wrapping — u can go outside [0, 2π] for open shapes (ball flies off edge).
    // Linear extrapolation: surface continues tangentially beyond its physical extent.
    return -(u - Math.PI) * R;
  }

  // Surface point in cross-section plane (x along f.nor, y along f.bin)
  // Ball contact always at (x=-R, y=0). Surface curves from there based on kappa.
  // Convention: x=-R is "floor" = -f.nor = world down for level spline.
  function getPoint(u, s, R) {
    const k     = getKappa(s);
    const kappa = k / R;
    const l     = uToL(u, R);
    if (Math.abs(kappa) < 1e-9) {
      // Flat surface: y varies, x = -R constant
      return { x: -R, y: l };
    }
    const theta = l * kappa;
    return {
      x: -R + (1 - Math.cos(theta)) / kappa,
      y:      Math.sin(theta) / kappa,
    };
  }

  // Ball-side surface normal at cross-section point: N = (cos(θ), -sin(θ))
  // Always points FROM surface TOWARD ball, regardless of curvature sign.
  // At u=π (floor, θ=0): N=(1,0)=+f.nor=upward ✓ for both tube and anti-tube.
  function getBallSideNormal(u, s, R) {
    const k     = getKappa(s);
    const kappa = k / R;
    const l     = uToL(u, R);
    const theta = l * kappa;
    return { nx: Math.cos(theta), ny: -Math.sin(theta) };
  }

  // Floor u: angular position where world gravity pulls the ball.
  // Finds surface point with highest dot-product with world gravity direction.
  // No sign flip — works for all κ automatically:
  //   tube  (k>0): max at u=π (bottom of bowl)
  //   flat  (k=0): all equal, stays at u=π
  //   anti  (k<0): max at u=0/2π (equator of dome — ball rests on outside edge)
  function getFloorU(s, f, R) {
    const worldDown = new THREE.Vector3(0, -1, 0);
    const gPerp = worldDown.clone().addScaledVector(f.tan, -worldDown.dot(f.tan));
    if (gPerp.lengthSq() < 0.0001) return Math.PI;
    gPerp.normalize();
    const gx = gPerp.dot(f.nor);
    const gy = gPerp.dot(f.bin);

    let bestU = Math.PI, bestDot = -Infinity;
    const N = 64;
    for (let i = 0; i < N; i++) {
      const u = (i / N) * Math.PI * 2;
      const { x, y } = getPoint(u, s, R);
      const dot = x * gx + y * gy;
      if (dot > bestDot) { bestDot = dot; bestU = u; }
    }
    return bestU;
  }

  // Compat shim: getIsAnti still usable but no longer drives ball placement
  function getIsAnti(s) {
    const k = getKappa(s);
    return { anti: k < 0, blend: 0.5 - k * 0.5, kappa: k };
  }

  // Open surface: |k| < 1 → ball can reach free edges, no wrap
  function getIsOpen(s) {
    return Math.abs(getKappa(s)) < 0.999;
  }

  // Surface tangent direction at u (unit vector in cross-section plane, pointing toward increasing u)
  // T(θ) = (sin(θ), cos(θ)) rotated by handedness — derivative of P with respect to l
  function getSurfaceTangent(u, s, R) {
    const k     = getKappa(s);
    const kappa = k / R;
    const l     = uToL(u, R);
    const theta = l * kappa;
    // dP/dl = (sin(θ), cos(θ)) — tangent along surface in direction of increasing l
    // increasing l ↔ decreasing u (from uToL negation), so flip sign for increasing u
    return { tx: -Math.sin(theta), ty: Math.cos(theta) };
  }

  return { getPoint, getFloorU, getIsAnti, getIsOpen, getKappa, getArcSpan, getTwist, getBallSideNormal, getSurfaceTangent };
}
