import * as THREE from 'three';
import { makeSurfaceFrame } from './surfaceTypes.js';

/**
 * Returns a THREE.Vector3 on the tube wall at arc-length s, angle u.
 * @param {object} segment - SurfaceSegment
 * @param {number} s - arc-length [0, segment.length]
 * @param {number} u - angle [0, 2PI]
 * @returns {THREE.Vector3}
 */
export function getPointOnSurface(segment, s, u) {
  const t = s / segment.length;
  const frame = segment.centerline.getFrameAt(t);
  const radialDir = new THREE.Vector3()
    .addScaledVector(frame.normal, Math.cos(u))
    .addScaledVector(frame.binormal, Math.sin(u));
  return new THREE.Vector3().addVectors(frame.position, radialDir.multiplyScalar(segment.radius));
}

/**
 * Returns a SurfaceFrame at arc-length s, angle u, with optional inward offset.
 * For tube-inner: the inward normal is -radialDir (pointing toward tube center).
 * radialOffset > 0 moves the position away from the wall (toward center).
 * @param {object} segment
 * @param {number} s
 * @param {number} u
 * @param {number} [radialOffset=0]
 * @returns {object} SurfaceFrame
 */
export function getFrame(segment, s, u, radialOffset = 0) {
  const t = s / segment.length;
  const rmf = segment.centerline.getFrameAt(t);

  const radialDir = new THREE.Vector3()
    .addScaledVector(rmf.normal, Math.cos(u))
    .addScaledVector(rmf.binormal, Math.sin(u))
    .normalize();

  // Surface position on tube wall, offset inward
  const position = new THREE.Vector3()
    .addVectors(rmf.position, radialDir.clone().multiplyScalar(segment.radius))
    .addScaledVector(radialDir, -radialOffset);

  // For tube-inner: surface normal faces inward (toward center)
  const inwardNormal = radialDir.clone().negate();

  return makeSurfaceFrame(position, rmf.tangent.clone(), inwardNormal, rmf.binormal.clone());
}

/**
 * Returns the outward radial normal at u=0 for arc-length s (the RMF normal).
 * @param {object} segment
 * @param {number} s
 * @returns {THREE.Vector3}
 */
export function getSNormal(segment, s) {
  const t = s / segment.length;
  return segment.centerline.getFrameAt(t).normal.clone();
}

/**
 * Returns the forward tangent direction at arc-length s.
 * @param {object} segment
 * @param {number} s
 * @returns {THREE.Vector3}
 */
export function getTangentAt(segment, s) {
  const t = s / segment.length;
  return segment.centerline.getFrameAt(t).tangent.clone();
}
