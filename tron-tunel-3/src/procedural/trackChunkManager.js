import * as THREE from 'three';
import { TUNNEL_R } from '../config.js';
import { PROC_CFG } from '../config.js';
import { seededRng, lerp, clamp } from './math.js';
import { buildCurve } from './curves.js';
import { makeSurfaceSegment, makeSafeTrack, makeSafeTrackSample } from './surfaceTypes.js';
import { createTrackWorld } from './trackWorld.js';

export function createTrackChunkManager(globalSeed) {
  let nextChunkIndex = 0;
  const chunks = []; // { index, id, segment, lastPoint, lastNormal, lastTangent, lastSafeU }

  const trackWorld = createTrackWorld(globalSeed, []);

  function computeFloorU(curveData, s) {
    const t = Math.max(0, Math.min(1, s / curveData.length));
    const frame = curveData.getFrameAt(t);
    // Project world-down (0,-1,0) into the tube cross-section plane
    const worldDown = new THREE.Vector3(0, -1, 0);
    const gPerp = worldDown.clone()
      .addScaledVector(frame.tangent, -worldDown.dot(frame.tangent));
    if (gPerp.lengthSq() < 0.0001) return Math.PI;
    gPerp.normalize();
    // Angle in RMF basis: atan2(binormal component, normal component)
    return Math.atan2(gPerp.dot(frame.binormal), gPerp.dot(frame.normal));
  }

  function generateChunk() {
    const rng = seededRng(globalSeed + nextChunkIndex * 1000);

    const segLen = lerp(PROC_CFG.SEGMENT_LENGTH_MIN, PROC_CFG.SEGMENT_LENGTH_MAX, rng());

    // Start state from previous chunk or defaults
    const prev = chunks.length > 0 ? chunks[chunks.length - 1] : null;
    const startPoint   = prev ? prev.lastPoint.clone()   : new THREE.Vector3(0, 0, 0);
    const startTangent = prev ? prev.lastTangent.clone()  : new THREE.Vector3(0, 0, 1);
    const startNormal  = prev ? prev.lastNormal.clone()   : new THREE.Vector3(0, 1, 0);
    const startS       = prev ? prev.startS + prev.segment.length : 0;

    // Number of intermediate control points
    const N = PROC_CFG.CONTROL_POINTS_MIN +
      Math.floor(rng() * (PROC_CFG.CONTROL_POINTS_MAX - PROC_CFG.CONTROL_POINTS_MIN + 1));

    const stepSize = segLen / (N + 1);

    // Walk from startPoint, rotating direction each step
    let currentDir = startTangent.clone().normalize();
    let currentPoint = startPoint.clone();
    const intermediates = [];

    for (let i = 0; i < N; i++) {
      if (i > 0) {
        // Horizontal rotation (yaw around world Y)
        // i=0 skipped: first intermediate lies along startTangent so CatmullRom
        // computes the correct entry tangent — eliminates kink at chunk boundaries.
        const turnXZ = (rng() * 2 - 1) * PROC_CFG.MAX_TURN_XZ;
        const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turnXZ);
        currentDir.applyQuaternion(qH);

        // Vertical rotation (pitch around right vector)
        const turnY = (rng() * 2 - 1) * PROC_CFG.MAX_TURN_Y;
        const right = new THREE.Vector3(-currentDir.z, 0, currentDir.x).normalize();
        if (right.lengthSq() < 0.001) right.set(1, 0, 0);
        const qV = new THREE.Quaternion().setFromAxisAngle(right, turnY);
        currentDir.applyQuaternion(qV).normalize();
      }

      currentPoint = currentPoint.clone().addScaledVector(currentDir, stepSize);
      intermediates.push(currentPoint.clone());
    }

    const endPoint = currentPoint.clone().addScaledVector(currentDir, stepSize);
    const points = [startPoint, ...intermediates, endPoint];

    const curveData = buildCurve(points, startNormal);

    const segId = 'seg-' + nextChunkIndex;
    const segment = makeSurfaceSegment(segId, 'tube-inner', curveData, TUNNEL_R, curveData.length);

    // Generate safe track: follows physical floor (world gravity projected onto tube cross-section)
    const SAMPLES = PROC_CFG.SAFE_TRACK_SAMPLES;
    // Wide floor zone: spans ~120° of circumference (TUNNEL_R * PI/1.5 world units)
    const floorWidth = TUNNEL_R * 2.0;
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      const s = (i / (SAMPLES - 1)) * curveData.length;
      const u = computeFloorU(curveData, s);
      samples.push(makeSafeTrackSample(s, u, floorWidth));
    }

    const safeTrack = makeSafeTrack('track-' + nextChunkIndex, segId, samples);
    safeTrack.radius = TUNNEL_R;
    segment.safeTracks.push(safeTrack);

    const lastFrameAt1 = curveData.getFrameAt(1);
    const lastSafeU = computeFloorU(curveData, curveData.length);

    chunks.push({
      index: nextChunkIndex,
      id: segId,
      segment,
      startS,
      lastPoint:   lastFrameAt1.position.clone(),
      lastNormal:  lastFrameAt1.normal.clone(),
      lastTangent: lastFrameAt1.tangent.clone(),
      lastSafeU,
    });

    trackWorld.addSurface(segment);
    nextChunkIndex++;
  }

  function update(currentSegId, currentS) {
    const playerIdx = currentSegId
      ? parseInt(currentSegId.split('-')[1], 10)
      : -1;

    // Generate ahead until we have LOOKAHEAD_SEGMENTS chunks beyond the player
    while (chunks.filter(c => c.index > playerIdx).length < PROC_CFG.LOOKAHEAD_SEGMENTS) {
      generateChunk();
    }

    // Remove trailing chunks too far behind
    while (chunks.length > 0 && chunks[0].index < playerIdx - PROC_CFG.TRAIL_SEGMENTS) {
      const removed = chunks.shift();
      trackWorld.removeSurface(removed.id);
    }
  }

  return {
    trackWorld,
    update,
    getFirstSegmentId() {
      return chunks[0]?.id ?? null;
    },
    advanceToNextSegment(currentId) {
      const idx = chunks.findIndex(c => c.id === currentId);
      return chunks[idx + 1]?.id ?? null;
    },
    getSegmentLength(id) {
      return chunks.find(c => c.id === id)?.segment.length ?? 0;
    },
    getChunkStartS(id) {
      return chunks.find(c => c.id === id)?.startS ?? 0;
    },
  };
}
