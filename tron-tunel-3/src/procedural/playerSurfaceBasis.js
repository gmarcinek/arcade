import * as THREE from 'three';
import { state } from '../state.js';
import { TUNNEL_R } from '../config.js';
import { PROC_CFG } from './proceduralConfig.js';

let _spline = null;
let _crossSection = null;

export function initPlayerSurfaceBasis(spline, crossSection) {
  _spline = spline;
  _crossSection = crossSection;
}

/**
 * Returns SurfaceFrame for camera and ball rendering.
 * Ball is ALWAYS on the same side of the surface.
 * Surface curvature κ changes, not the ball's relationship to the surface.
 *
 * normal  = ball-side surface normal = "away from surface toward ball"
 *           For tube: inward. For anti-tube at equator: outward.
 *           Always consistent with ball placement.
 * forward = spline tangent
 * right   = f.bin (spline binormal)
 */
export function getPlayerFrame() {
  if (!_spline) return null;
  const f = _spline.getFrameAt(state.s);
  if (!f) return null;

  const u = state.u;

  // Apply twist — must match infiniteMesh.js. Arc span is visual only, radius = TUNNEL_R.
  const twistRot = _crossSection ? _crossSection.getTwist(state.s) * Math.PI * 2 : 0;
  const cosT = Math.cos(twistRot), sinT = Math.sin(twistRot);
  const norT = new THREE.Vector3(
    f.nor.x * cosT + f.bin.x * sinT,
    f.nor.y * cosT + f.bin.y * sinT,
    f.nor.z * cosT + f.bin.z * sinT,
  );
  const binT = new THREE.Vector3(
    -f.nor.x * sinT + f.bin.x * cosT,
    -f.nor.y * sinT + f.bin.y * cosT,
    -f.nor.z * sinT + f.bin.z * cosT,
  );

  // Surface point in world space
  const pt = _crossSection
    ? _crossSection.getPoint(u, state.s, TUNNEL_R)
    : { x: TUNNEL_R * Math.cos(u), y: TUNNEL_R * Math.sin(u) };

  const surfaceWorld = new THREE.Vector3()
    .copy(f.pos)
    .addScaledVector(norT, pt.x)
    .addScaledVector(binT, pt.y);

  // Ball-side surface normal in world space
  const nLocal = _crossSection
    ? _crossSection.getBallSideNormal(u, state.s, TUNNEL_R)
    : { nx: Math.cos(u), ny: Math.sin(u) };

  const ballSideWorld = new THREE.Vector3()
    .addScaledVector(norT, nLocal.nx)
    .addScaledVector(binT, nLocal.ny)
    .normalize();

  // Ball position: surface point + radialOffset along ball-side normal
  const position = surfaceWorld.clone()
    .addScaledVector(ballSideWorld, state.radialOffset);

  // Look-ahead position: weighted blend of SURFACE positions ahead at ball's u
  // Uses same cross-section + twist as ball — points land on the tube surface, not center
  const laOffsets = PROC_CFG.CAM_LOOKAHEAD_OFFSETS;
  const laWeights = PROC_CFG.CAM_LOOKAHEAD_WEIGHTS;
  const lookAheadPos = new THREE.Vector3();
  let totalW = 0;
  for (let i = 0; i < laOffsets.length; i++) {
    const sAhead = state.s + laOffsets[i];
    const fa = _spline.getFrameAt(sAhead);
    if (!fa) continue;
    // Apply same twist as ball at this s
    const twAhead = _crossSection ? _crossSection.getTwist(sAhead) * Math.PI * 2 : 0;
    const cA = Math.cos(twAhead), sA = Math.sin(twAhead);
    const nA = new THREE.Vector3(
      fa.nor.x * cA + fa.bin.x * sA,
      fa.nor.y * cA + fa.bin.y * sA,
      fa.nor.z * cA + fa.bin.z * sA,
    );
    const bA = new THREE.Vector3(
      -fa.nor.x * sA + fa.bin.x * cA,
      -fa.nor.y * sA + fa.bin.y * cA,
      -fa.nor.z * sA + fa.bin.z * cA,
    );
    // Surface point at ball's u + radialOffset → ball-height position ahead
    const pt = _crossSection
      ? _crossSection.getPoint(state.u, sAhead, TUNNEL_R)
      : { x: TUNNEL_R * Math.cos(state.u), y: TUNNEL_R * Math.sin(state.u) };
    const nLocal = _crossSection
      ? _crossSection.getBallSideNormal(state.u, sAhead, TUNNEL_R)
      : { nx: Math.cos(state.u), ny: Math.sin(state.u) };
    const ballSideAhead = new THREE.Vector3()
      .addScaledVector(nA, nLocal.nx)
      .addScaledVector(bA, nLocal.ny)
      .normalize();
    const surfPt = new THREE.Vector3()
      .copy(fa.pos)
      .addScaledVector(nA, pt.x)
      .addScaledVector(bA, pt.y)
      .addScaledVector(ballSideAhead, state.radialOffset);
    lookAheadPos.addScaledVector(surfPt, laWeights[i]);
    totalW += laWeights[i];
  }
  if (totalW > 0) lookAheadPos.divideScalar(totalW); else lookAheadPos.copy(position);

  const trackPitch = _spline.getFrameAt(state.s + 10)?.tan.y ?? 0;

  return {
    position,
    tangent:  f.tan.clone(),
    normal:   ballSideWorld.clone(),  // away from surface toward ball
    binormal: f.bin.clone(),
    forward:  f.tan.clone(),
    right:    f.bin.clone(),
    up:       ballSideWorld.clone().negate(), // toward surface (for wake/ribbon)
    trackPitch,
    lookAheadPos,
  };
}
