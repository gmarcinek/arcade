import { clamp } from './math.js';

/**
 * Computes the shortest signed angular difference between two angles.
 * Returns a value in (-PI, PI].
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function angleDiff(a, b) {
  let d = ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d;
}

/**
 * Queries safety information at position (s, u) against a SafeTrack.
 * @param {object} safeTrack - SafeTrack object with .samples array and segment radius context
 * @param {number} s - arc-length
 * @param {number} u - angle [0, 2PI]
 * @returns {{ onSafeTrack: boolean, width: number, dangerLevel: number, distanceToCenter: number }}
 */
export function getSafeInfo(safeTrack, s, u) {
  const samples = safeTrack.samples;
  if (!samples || samples.length === 0) {
    return { onSafeTrack: false, width: 0, dangerLevel: 1, distanceToCenter: Math.PI };
  }

  // Find closest sample by arc-length s
  let nearest = samples[0];
  let minDist = Math.abs(s - samples[0].s);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(s - samples[i].s);
    if (d < minDist) {
      minDist = d;
      nearest = samples[i];
    }
  }

  // Angular half-width in radians: width / (2 * radius)
  // The radius is embedded as nearest.radius or falls back to a stored reference.
  // We store it on the safeTrack itself during generation.
  const radius = safeTrack.radius || 12;
  const halfWidth = nearest.width / (2 * radius);

  const angularDist = Math.abs(angleDiff(u, nearest.u));

  const onSafeTrack = angularDist < halfWidth;
  const dangerLevel = clamp(angularDist / halfWidth - 0.8, 0, 1);

  return {
    onSafeTrack,
    width: nearest.width,
    dangerLevel,
    distanceToCenter: angularDist,
  };
}
