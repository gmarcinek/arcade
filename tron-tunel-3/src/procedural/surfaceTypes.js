/**
 * Factory functions for procedural surface data types.
 * All return plain JS objects — no classes, no THREE dependency.
 */

/**
 * @param {import('three').Vector3} position
 * @param {import('three').Vector3} tangent
 * @param {import('three').Vector3} normal
 * @param {import('three').Vector3} binormal
 */
export function makeSurfaceFrame(position, tangent, normal, binormal) {
  return {
    position,
    tangent,
    normal,
    binormal,
    up: normal.clone().negate(),
    right: binormal.clone(),
    forward: tangent.clone(),
  };
}

/**
 * @param {number} s - arc-length position
 * @param {number} u - angle [0, 2PI]
 * @param {number} width - world-unit width of the safe track
 */
export function makeSafeTrackSample(s, u, width) {
  return { s, u, width };
}

/**
 * @param {string} id
 * @param {string} surfaceId
 * @param {Array<{s:number, u:number, width:number}>} samples
 */
export function makeSafeTrack(id, surfaceId, samples) {
  return {
    id,
    surfaceId,
    samples,
    gaps: [],
    landingZones: [],
    difficulty: 0,
    tags: ['main'],
  };
}

/**
 * @param {string} id
 * @param {string} kind - e.g. 'tube-inner'
 * @param {object} centerlineCurve - result of buildCurve(points)
 * @param {number} radius
 * @param {number} length
 */
export function makeSurfaceSegment(id, kind, centerlineCurve, radius, length) {
  return {
    id,
    kind,
    centerline: centerlineCurve,
    radius,
    length,
    safeTracks: [],
  };
}
