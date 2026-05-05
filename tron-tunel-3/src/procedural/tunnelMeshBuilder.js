import * as THREE from 'three';
import { TUNNEL_R } from '../config.js';

const TUBE_TUBULAR_SEGMENTS = 120;
const TUBE_RADIAL_SEGMENTS  = 64;

/**
 * Creates a ShaderMaterial for a tube segment.
 * segGlobalS and segLength are set once at mesh creation and never change.
 * time, playerGlobalS, playerWorldPos are updated every frame.
 */
function makeTubeMaterial(segGlobalS, segLength) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      time:           { value: 0 },
      playerGlobalS:  { value: 0 },
      playerWorldPos: { value: new THREE.Vector3() },
      segGlobalS:     { value: segGlobalS },
      segLength:      { value: segLength },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      #define PI 3.14159265359

      uniform float time;
      uniform float playerGlobalS;
      uniform vec3  playerWorldPos;
      uniform float segGlobalS;
      uniform float segLength;

      varying vec3 vWorld;
      varying vec2 vUv;

      float angleDist(float a, float b) {
        return abs(atan(sin(a - b), cos(a - b)));
      }

      void main() {
        // UV.x maps 0→1 around the tube. Convert to angle [-PI, PI].
        float angle    = (vUv.x * 2.0 - 1.0) * PI;
        float absAngle = abs(angle);

        // fragS: continuous arc-length across ALL segment meshes (no UV.y discontinuity at boundaries)
        float fragS = segGlobalS + vUv.y * segLength;

        // Depth fade: arc-length distance from player — continuous across segment boundaries
        float dS        = abs(fragS - playerGlobalS);
        float depthFade = 0.55 + 0.45 * exp(-dS * 0.009);

        // ---- cyan per-element breathe (different frequencies, never sync) ----
        float cyanGrid  = pow(max(0.0, sin(time * 0.53 + 0.0)), 2.2);
        float cyanRing  = pow(max(0.0, sin(time * 0.41 + 1.9)), 2.2);
        float cyanStrip = pow(max(0.0, sin(time * 0.67 + 0.7)), 2.2);
        float cyanTile2 = pow(max(0.0, sin(time * 0.31 + 3.1)), 2.2);
        float cyanChev  = pow(max(0.0, sin(time * 0.47 + 5.4)), 2.2);

        // ---- base colour: near-black amber ----
        vec3 col = vec3(0.008, 0.002, 0.001);

        // Polished sheen near angle=0
        float sheen = pow(max(0.0, 1.0 - absAngle * 1.6), 4.0);
        col += sheen * vec3(0.005, 0.012, 0.022);
        col *= depthFade;

        // ---- LAVA LAMP (fragS for spatial continuity across segment boundaries) ----
        float lv1 =
            sin(angle * 1.45 + fragS * 0.085 + time * 0.20) * 0.42
          + sin(angle * 2.30 - fragS * 0.061 + time * 0.13) * 0.31
          + sin(angle * 0.85 + fragS * 0.039 - time * 0.18) * 0.36
          + sin(angle * 3.55 - fragS * 0.026 - time * 0.10) * 0.22;
        float lv2 =
            sin(angle * 1.10 - fragS * 0.115 - time * 0.15) * 0.38
          + sin(angle * 2.85 + fragS * 0.052 + time * 0.17) * 0.29
          + sin(angle * 4.20 - fragS * 0.031 + time * 0.08) * 0.20;

        float lavaRaw1 = lv1 * 0.5 + 0.5;
        float lavaRaw2 = lv2 * 0.5 + 0.5;

        float lavaBlob1 = smoothstep(0.18, 0.72, lavaRaw1);
        float lavaBlob2 = smoothstep(0.22, 0.78, lavaRaw2);
        float lavaHot1  = smoothstep(0.58, 0.92, lavaRaw1);
        float lavaHot2  = smoothstep(0.62, 0.95, lavaRaw2);
        float lavaEdge1 = smoothstep(0.30, 0.58, lavaRaw1) * (1.0 - smoothstep(0.78, 0.96, lavaRaw1));
        float lavaEdge2 = smoothstep(0.28, 0.62, lavaRaw2) * (1.0 - smoothstep(0.80, 0.98, lavaRaw2));
        float lavaPulse = 0.72 + 0.28 * sin(time * 0.23 + 1.3);

        vec3 lavaDark = vec3(0.55, 0.10, 0.015);
        vec3 lavaMid  = vec3(0.95, 0.22, 0.025);
        vec3 lavaHot  = vec3(1.00, 0.48, 0.08);
        vec3 lavaMag  = vec3(0.42, 0.035, 0.18);

        vec3 lavaCol =
            lavaDark * lavaBlob1 * 0.45
          + lavaMid  * lavaBlob2 * 0.38
          + lavaHot  * (lavaHot1 + lavaHot2) * 0.32
          + lavaMag  * lavaEdge2 * 0.22;

        float lavaReadableZone = 0.60 + 0.40 * pow(max(0.0, 1.0 - absAngle * 0.42), 2.0);
        col += lavaCol * depthFade * lavaPulse * lavaReadableZone * 0.72;
        col += vec3(0.42, 0.08, 0.015) * (lavaBlob1 * 0.55 + lavaBlob2 * 0.45) * depthFade * 0.22;

        // ---- CONTACT GLOW: 3D world-space distance (correct on any curve) ----
        vec3  toPlayer = vWorld - playerWorldPos;
        float distSq   = dot(toPlayer, toPlayer);

        // wide oval
        float reflMask     = exp(-distSq * 0.045);
        float reflWideMask = exp(-distSq * 0.018);

        float reflNoise =
            sin(fragS * 2.2 + angle * 18.0 + time * 3.5) * 0.5
          + sin(fragS * 4.7 - angle * 11.0 - time * 2.1) * 0.5;
        float shimmer = 0.82 + 0.18 * reflNoise;

        col += reflWideMask * vec3(0.01, 0.025, 0.035) * 0.85 * depthFade;
        col += reflMask     * vec3(0.35, 0.95, 1.00)   * 1.35 * shimmer * depthFade;
        col += exp(-distSq * 0.12) * vec3(0.95, 1.00, 1.00) * 1.25 * depthFade;
        col += reflWideMask * (0.45 + 0.55 * sin(time * 7.0 + fragS * 0.9)) * vec3(1.0, 0.95, 0.0) * 0.12 * depthFade;

        // ---- fine angular grid: 120 divisions ----
        float fineAng = smoothstep(0.91, 1.0, abs(sin(angle * 60.0)));
        col += fineAng * vec3(0.0, 0.10, 0.20) * depthFade * cyanGrid;

        // ---- ring seams (fragS — continuous across segment boundaries) ----
        float ringSeam   = smoothstep(0.94, 1.0, abs(sin(fragS * 0.7854)));
        float ringCoarse = smoothstep(0.91, 1.0, abs(sin(fragS * 0.196)));
        col += ringSeam   * vec3(0.0, 0.10, 0.20) * depthFade * cyanRing;
        col += ringCoarse * vec3(0.0, 0.18, 0.34) * depthFade * 0.55 * cyanRing;

        // ---- 8 cyan running-light strips ----
        float strip = step(0.984, abs(sin(angle * 4.0)));
        float pulse = 0.5 + 0.5 * sin(fragS * 0.55 - time * 6.5);
        col += strip * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip;
        col += strip * sheen * vec3(0.15, 0.45, 0.75) * 0.18 * depthFade * cyanStrip;

        // ---- amber rectangular panel tiles ----
        float tileAng = step(0.955, abs(sin(angle * 22.0 + 0.5)));
        float tileS   = step(0.920, abs(sin(fragS * 0.85)));
        col += tileAng * tileS * vec3(1.0, 0.45, 0.04) * 0.65 * depthFade;

        // ---- cyan tile variant ----
        float tileAng2 = step(0.968, abs(sin(angle * 38.0 + 1.8)));
        float tileS2   = step(0.948, abs(sin(fragS * 1.85 - time * 0.11)));
        col += tileAng2 * tileS2 * vec3(0.05, 0.55, 0.80) * 0.38 * depthFade * cyanTile2;

        // ---- scrolling chevrons on floor (angle≈0 zone) ----
        float ground = smoothstep(0.55, 0.0, absAngle);
        float chev   = abs(sin(fragS * 0.85 - time * 5.5));
        col += ground * step(0.86, chev) * vec3(0.0, 0.60, 0.80) * 0.28 * depthFade * cyanChev;

        // ---- orange floor boundary: narrow seam at UV.x = 0/1 ----
        float uvEdge = min(vUv.x, 1.0 - vUv.x);
        col += smoothstep(0.006, 0.0, uvEdge) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade;
        col += smoothstep(0.057, 0.0, uvEdge) * vec3(1.0, 0.38, 0.0)  * 1.6 * depthFade;
        col += smoothstep(0.076, 0.0, uvEdge) * vec3(0.9, 0.28, 0.0)  * 0.28 * depthFade;
        col += smoothstep(0.175, 0.0, uvEdge) * vec3(0.7, 0.15, 0.0)  * 0.10 * depthFade;

        // ---- amber tile bloom ----
        col += tileAng * tileS * vec3(0.8, 0.22, 0.0) * 0.18 * depthFade
             * smoothstep(0.0, 1.0, 1.0 - abs(sin(angle * 22.0 + 0.5)) * 12.0 + 11.0);

        col = min(col, vec3(3.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function buildTubeMesh(segment, segGlobalS) {
  const geo = new THREE.TubeGeometry(
    segment.centerline.curve,
    TUBE_TUBULAR_SEGMENTS,
    segment.radius ?? TUNNEL_R,
    TUBE_RADIAL_SEGMENTS,
    false,
  );
  const mat = makeTubeMaterial(segGlobalS, segment.length);
  return new THREE.Mesh(geo, mat);
}

export class TunnelMeshManager {
  constructor(scene) {
    this._scene  = scene;
    this._meshes = new Map(); // segmentId -> { mesh, mat }
    this._time   = 0;
  }

  /**
   * activeSurfaces: array of SurfaceSegment objects
   * chunkManager:   the chunk manager (for getChunkStartS)
   * dt:             delta time
   * playerGlobalS:  player's cumulative arc-length (chunkManager.getChunkStartS(activeSurfaceId) + state.s)
   * playerWorldPos: THREE.Vector3 ball world position
   */
  update(activeSurfaces, chunkManager, dt, playerGlobalS, playerWorldPos) {
    this._time += dt;

    const activeIds = new Set(activeSurfaces.map(s => s.id));

    // Remove stale meshes
    for (const [id, entry] of this._meshes) {
      if (!activeIds.has(id)) {
        this._scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mat.dispose();
        this._meshes.delete(id);
      }
    }

    // Add new meshes
    for (const seg of activeSurfaces) {
      if (!this._meshes.has(seg.id)) {
        const segGlobalS = chunkManager.getChunkStartS(seg.id);
        const mesh = buildTubeMesh(seg, segGlobalS);
        this._scene.add(mesh);
        this._meshes.set(seg.id, { mesh, mat: mesh.material });
      }
    }

    // Update per-frame uniforms on ALL active materials
    for (const { mat } of this._meshes.values()) {
      mat.uniforms.time.value          = this._time;
      mat.uniforms.playerGlobalS.value = playerGlobalS;
      mat.uniforms.playerWorldPos.value.copy(playerWorldPos);
    }
  }

  dispose() {
    for (const [, entry] of this._meshes) {
      this._scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mat.dispose();
    }
    this._meshes.clear();
  }
}
