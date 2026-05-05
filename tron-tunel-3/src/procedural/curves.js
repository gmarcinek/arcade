import * as THREE from 'three';
import { lerp } from './math.js';

const RMF_SAMPLES = 32; // Number of samples for RMF frames along the curve. Higher = smoother frames but more memory and CPU usage.

/**
 * Wraps THREE.CatmullRomCurve3 with Rotation Minimizing Frames via parallel transport.
 * @param {THREE.Vector3[]} points
 * @returns {{ curve: THREE.CatmullRomCurve3, length: number, getFrameAt: (t: number) => { position: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3, binormal: THREE.Vector3 } }}
 */
export function buildCurve(points, initialNormal = null) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const length = curve.getLength();

  // Sample N points for RMF computation
  const N = RMF_SAMPLES;
  const pts = curve.getPoints(N - 1); // returns N points at t = 0..1
  const tangents = new Array(N);
  const normals = new Array(N);
  const binormals = new Array(N);

  // Compute tangents via finite differences
  for (let i = 0; i < N; i++) {
    const prev = i > 0 ? pts[i - 1] : pts[0];
    const next = i < N - 1 ? pts[i + 1] : pts[N - 1];
    tangents[i] = new THREE.Vector3().subVectors(next, prev).normalize();
  }

  // Bootstrap normal[0]: use provided initialNormal if valid, else cross-product fallback
  const t0 = tangents[0];
  if (initialNormal && initialNormal.lengthSq() > 0.001) {
    const n0 = initialNormal.clone().addScaledVector(t0, -initialNormal.dot(t0)).normalize();
    normals[0] = n0;
  } else {
    const up = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    normals[0] = new THREE.Vector3()
      .crossVectors(up, t0)
      .normalize();
    // If cross product is zero-ish, try another axis
    if (normals[0].lengthSq() < 0.001) {
      normals[0].crossVectors(new THREE.Vector3(0, 0, 1), t0).normalize();
    }
  }
  binormals[0] = new THREE.Vector3().crossVectors(tangents[0], normals[0]).normalize();

  // Parallel transport (double reflection)
  for (let i = 1; i < N; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];

    const v1 = new THREE.Vector3().subVectors(p1, p0);
    const c1 = v1.dot(v1);

    let nL, tL;
    if (c1 < 1e-12) {
      // Degenerate: reuse previous
      nL = normals[i - 1].clone();
      tL = tangents[i - 1].clone();
    } else {
      const inv2c1 = 2 / c1;
      nL = normals[i - 1]
        .clone()
        .addScaledVector(v1, -inv2c1 * v1.dot(normals[i - 1]));
      tL = tangents[i - 1]
        .clone()
        .addScaledVector(v1, -inv2c1 * v1.dot(tangents[i - 1]));
    }

    const v2 = new THREE.Vector3().subVectors(tangents[i], tL);
    const c2 = v2.dot(v2);

    if (c2 < 1e-12) {
      normals[i] = nL.normalize();
    } else {
      normals[i] = nL
        .clone()
        .addScaledVector(v2, -(2 / c2) * v2.dot(nL))
        .normalize();
    }

    binormals[i] = new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize();
  }

  // t in [0,1] -> sample index with lerp
  function getFrameAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const fIdx = clamped * (N - 1);
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(i0 + 1, N - 1);
    const alpha = fIdx - i0;

    const position = new THREE.Vector3().lerpVectors(pts[i0], pts[i1], alpha);

    const tangent = new THREE.Vector3()
      .lerpVectors(tangents[i0], tangents[i1], alpha)
      .normalize();

    const normal = new THREE.Vector3()
      .lerpVectors(normals[i0], normals[i1], alpha)
      .normalize();

    const binormal = new THREE.Vector3()
      .crossVectors(tangent, normal)
      .normalize();

    return { position, tangent, normal, binormal };
  }

  // Override Three.js's internal Frenet-frame calculation so that
  // TubeGeometry uses our RMF. This ensures UV.x=0 is oriented identically
  // at both ends of consecutive segment meshes → no UV twist at boundaries.
  curve.computeFrenetFrames = (segments, _closed) => {
    const out = { tangents: [], normals: [], binormals: [] };
    for (let i = 0; i <= segments; i++) {
      const f = getFrameAt(i / segments);
      out.tangents.push(f.tangent.clone());
      out.normals.push(f.normal.clone());
      out.binormals.push(f.binormal.clone());
    }
    return out;
  };

  return { curve, length, getFrameAt };
}
