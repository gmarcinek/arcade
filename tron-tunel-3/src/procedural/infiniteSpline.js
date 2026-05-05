import * as THREE from 'three';
import { seededRng } from './math.js';

// Spacing between stored RMF samples (meters)
const SAMPLE_STEP = 5;
// Max turn velocity (rad/step).
const MAX_TURN_RATE = 0.030;
// How fast turnYaw approaches its target per step (0–1 factor)
const TURN_APPROACH = 0.08;  // faster approach = smoother-looking transitions, less visible knee

/**
 * Creates a continuous procedural spline with Rotation Minimizing Frames.
 * State.s is a monotonically increasing global arc-length from 0.
 * No segments, no boundaries.
 */
export function createInfiniteSpline(seed) {
  const rng = seededRng(seed);

  // Each sample: { s, pos, tan, nor, bin }
  const samples = [];

  // Generation state
  let nextS  = 0;
  let pos    = new THREE.Vector3(0, 0, 0);
  let tan    = new THREE.Vector3(0, 0, 1);  // initial: +Z
  let nor    = new THREE.Vector3(0, 1, 0);  // initial: +Y
  let bin    = new THREE.Vector3(1, 0, 0);  // initial: +X

  // Hold-and-switch curve model: fully randomized from seed
  // Pre-burn rng a few times so spline start doesn't pattern on low-entropy seeds
  for (let _w = 0; _w < 8; _w++) rng();
  const startSign  = rng() > 0.5 ? 1 : -1;
  let turnYaw      = startSign * (0.2 + rng() * 0.8) * MAX_TURN_RATE;  // start already turning
  let turnPitch    = (rng() - 0.5) * MAX_TURN_RATE * 0.5;
  let yawTarget    = startSign * (0.5 + rng() * 0.5) * MAX_TURN_RATE;
  let pitchTarget  = (rng() - 0.5) * MAX_TURN_RATE * 0.35;
  let yawHoldSteps = Math.floor(20 + rng() * 60); // 20–80 steps = 100–400m

  function pushSample() {
    samples.push({
      s:   nextS,
      pos: pos.clone(),
      tan: tan.clone(),
      nor: nor.clone(),
      bin: bin.clone(),
    });
    nextS += SAMPLE_STEP;
  }

  function advanceOne() {
    // Hold-and-switch: steer toward current target, then pick new one
    yawHoldSteps--;
    if (yawHoldSteps <= 0) {
      // New target: always non-zero, random sign, 20–100% of max for variety
      const sign = rng() > 0.5 ? 1 : -1;
      const intensity = 0.20 + rng() * 0.80;  // varies 20%–100% instead of always 50–100%
      yawTarget    = sign * intensity * MAX_TURN_RATE;
      pitchTarget  = (rng() - 0.5) * MAX_TURN_RATE * 0.45;
      yawHoldSteps = Math.floor(20 + rng() * 80);  // 20–100 steps = 100–500m
    }
    // Smooth approach toward target
    turnYaw   += (yawTarget   - turnYaw)   * TURN_APPROACH;
    turnPitch += (pitchTarget - turnPitch) * TURN_APPROACH * 0.5;
    turnYaw   = Math.max(-MAX_TURN_RATE, Math.min(MAX_TURN_RATE, turnYaw));
    turnPitch = Math.max(-MAX_TURN_RATE * 0.5, Math.min(MAX_TURN_RATE * 0.5, turnPitch));
    // Gentle restoring force: push pitch back toward 0 when tan tilts too far from horizontal
    // Prevents long-distance vertical drift that could degenerate the RMF normal
    pitchTarget -= pitchTarget * 0.015;

    // Yaw: rotate tan around world Y
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turnYaw);
    tan.applyQuaternion(qY).normalize();

    // Pitch: rotate tan around horizontal right = worldY × tan
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan);
    if (right.lengthSq() > 0.0001) {
      right.normalize();
      const qP = new THREE.Quaternion().setFromAxisAngle(right, turnPitch);
      tan.applyQuaternion(qP).normalize();
    }

    // Parallel transport normal (project-and-renormalize RMF)
    const dot = nor.dot(tan);
    nor.addScaledVector(tan, -dot);
    if (nor.lengthSq() < 0.01) {
      // nor is nearly parallel to tan — rebuild from a stable reference axis
      const ref = (Math.abs(tan.y) < 0.9)
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      nor.crossVectors(ref, tan).normalize();
    } else {
      nor.normalize();
    }
    bin.crossVectors(tan, nor).normalize();

    // Advance position
    pos.addScaledVector(tan, SAMPLE_STEP);
  }

  // Seed initial samples
  pushSample();
  for (let i = 0; i < 6; i++) { advanceOne(); pushSample(); }

  /** Ensure spline is generated at least up to arc-length upToS */
  function extend(upToS) {
    while (nextS < upToS + SAMPLE_STEP * 3) {
      advanceOne();
      pushSample();
    }
  }

  /** Remove samples more than keepBehind meters behind keepFromS */
  function trim(keepFromS) {
    while (samples.length > 4 && samples[1].s < keepFromS) {
      samples.shift();
    }
  }

  /** Interpolated RMF frame at arc-length s */
  function getFrameAt(s) {
    if (samples.length < 2) return null;
    const first = samples[0], last = samples[samples.length - 1];
    if (s <= first.s) {
      return { pos: first.pos.clone(), tan: first.tan.clone(), nor: first.nor.clone(), bin: first.bin.clone() };
    }
    if (s >= last.s) {
      return { pos: last.pos.clone(), tan: last.tan.clone(), nor: last.nor.clone(), bin: last.bin.clone() };
    }
    // Binary search
    let lo = 0, hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].s <= s) lo = mid; else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (s - a.s) / (b.s - a.s);
    const iTan = new THREE.Vector3().lerpVectors(a.tan, b.tan, t).normalize();
    const iNor = new THREE.Vector3().lerpVectors(a.nor, b.nor, t);
    // Re-orthogonalize
    iNor.addScaledVector(iTan, -iNor.dot(iTan)).normalize();
    const iBin = new THREE.Vector3().crossVectors(iTan, iNor).normalize();
    return {
      pos: new THREE.Vector3().lerpVectors(a.pos, b.pos, t),
      tan: iTan,
      nor: iNor,
      bin: iBin,
    };
  }

  /**
   * Returns the tube angle u (radians) where world gravity (0,-1,0) would pull
   * a ball — i.e., the "floor" of the tube at arc-length s.
   */
  function getFloorU(s) {
    const f = getFrameAt(s);
    if (!f) return Math.PI;
    const worldDown = new THREE.Vector3(0, -1, 0);
    // Project worldDown onto cross-section plane (remove tangent component)
    const gPerp = worldDown.clone().addScaledVector(f.tan, -worldDown.dot(f.tan));
    if (gPerp.lengthSq() < 0.0001) return Math.PI;
    gPerp.normalize();
    return Math.atan2(gPerp.dot(f.bin), gPerp.dot(f.nor));
  }

  return { extend, trim, getFrameAt, getFloorU };
}
