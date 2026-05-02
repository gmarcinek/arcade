import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export function normalizeAngle(theta) {
  const twoPi = Math.PI * 2;
  return ((theta % twoPi) + twoPi) % twoPi;
}

export function getAngleDelta(target, current) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function getAngleDistanceDegrees(a, b) {
  return THREE.MathUtils.radToDeg(Math.abs(getAngleDelta(a, b)));
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function getBasis(theta) {
  const surfaceOut = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0);
  const up = surfaceOut.clone().multiplyScalar(-1);
  const right = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
  const forward = new THREE.Vector3(0, 0, 1);
  return { surfaceOut, up, right, forward };
}

export function getRollLandingErrorDegrees(rollAngle) {
  const twoPi = Math.PI * 2;
  let error = ((rollAngle % twoPi) + twoPi) % twoPi;
  if (error > Math.PI) error = twoPi - error;
  return THREE.MathUtils.radToDeg(Math.abs(error));
}
