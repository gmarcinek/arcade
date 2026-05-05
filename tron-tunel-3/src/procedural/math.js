/**
 * Seeded RNG using mulberry32 algorithm.
 * @param {number} seed - 32-bit integer seed
 * @returns {() => number} function returning floats in [0, 1)
 */
export function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mapRange(x, inMin, inMax, outMin, outMax) {
  return outMin + ((x - inMin) / (inMax - inMin)) * (outMax - outMin);
}
