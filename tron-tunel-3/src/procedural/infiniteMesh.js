import * as THREE from 'three';
import { TUNNEL_R } from '../config.js';

const RING_COUNT  = 80;    // total rings in the sliding window
const RADIAL_SEGS = 64;    // vertices around each ring
const RING_STEP   = 7;     // meters between rings
const BEHIND_DIST = 50;    // meters of tunnel rendered behind player
const TOTAL_LEN   = RING_COUNT * RING_STEP; // 560m total visible

function makeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      time:           { value: 0 },
      playerGlobalS:  { value: 0 },
      playerWorldPos: { value: new THREE.Vector3() },
      behindDist:     { value: BEHIND_DIST },
      totalLen:       { value: TOTAL_LEN },
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
      uniform float behindDist;
      uniform float totalLen;

      varying vec3 vWorld;
      varying vec2 vUv;

      float angleDist(float a, float b) {
        return abs(atan(sin(a - b), cos(a - b)));
      }

      void main() {
        // UV.x [0,1] → angle [-PI, PI] around tube
        float angle    = (vUv.x * 2.0 - 1.0) * PI;
        float absAngle = abs(angle);

        // fragS: continuous global arc-length for this fragment
        // UV.y is static [0,1] across RING_COUNT rings
        // playerGlobalS drives the scroll → no seams across any segment
        float fragS = playerGlobalS - behindDist + vUv.y * totalLen;

        // Depth fade: arc-length distance from player
        float dS        = abs(fragS - playerGlobalS);
        float depthFade = 0.55 + 0.45 * exp(-dS * 0.009);

        // cyan breathe
        float cyanGrid  = pow(max(0.0, sin(time * 0.53 + 0.0)), 2.2);
        float cyanRing  = pow(max(0.0, sin(time * 0.41 + 1.9)), 2.2);
        float cyanStrip = pow(max(0.0, sin(time * 0.67 + 0.7)), 2.2);
        float cyanTile2 = pow(max(0.0, sin(time * 0.31 + 3.1)), 2.2);
        float cyanChev  = pow(max(0.0, sin(time * 0.47 + 5.4)), 2.2);

        vec3 col = vec3(0.008, 0.002, 0.001);
        float sheen = pow(max(0.0, 1.0 - absAngle * 1.6), 4.0);
        col += sheen * vec3(0.005, 0.012, 0.022);
        col *= depthFade;

        // lava lamp (fragS for continuity)
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

        // contact glow (3D world-space)
        vec3  toPlayer = vWorld - playerWorldPos;
        float distSq   = dot(toPlayer, toPlayer);
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

        // 120-division angular grid
        float fineAng = smoothstep(0.91, 1.0, abs(sin(angle * 60.0)));
        col += fineAng * vec3(0.0, 0.10, 0.20) * depthFade * cyanGrid;

        // ring seams (fragS — seamless)
        float ringSeam   = smoothstep(0.94, 1.0, abs(sin(fragS * 0.7854)));
        float ringCoarse = smoothstep(0.91, 1.0, abs(sin(fragS * 0.196)));
        col += ringSeam   * vec3(0.0, 0.10, 0.20) * depthFade * cyanRing;
        col += ringCoarse * vec3(0.0, 0.18, 0.34) * depthFade * 0.55 * cyanRing;

        // 8 cyan running-light strips
        float strip = step(0.984, abs(sin(angle * 4.0)));
        float pulse = 0.5 + 0.5 * sin(fragS * 0.55 - time * 6.5);
        col += strip * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip;
        col += strip * sheen * vec3(0.15, 0.45, 0.75) * 0.18 * depthFade * cyanStrip;

        // amber panel tiles
        float tileAng = step(0.955, abs(sin(angle * 22.0 + 0.5)));
        float tileS   = step(0.920, abs(sin(fragS * 0.85)));
        col += tileAng * tileS * vec3(1.0, 0.45, 0.04) * 0.65 * depthFade;

        // cyan tile variant
        float tileAng2 = step(0.968, abs(sin(angle * 38.0 + 1.8)));
        float tileS2   = step(0.948, abs(sin(fragS * 1.85 - time * 0.11)));
        col += tileAng2 * tileS2 * vec3(0.05, 0.55, 0.80) * 0.38 * depthFade * cyanTile2;

        // scrolling chevrons on floor (angle≈0)
        float ground = smoothstep(0.55, 0.0, absAngle);
        float chev   = abs(sin(fragS * 0.85 - time * 5.5));
        col += ground * step(0.86, chev) * vec3(0.0, 0.60, 0.80) * 0.28 * depthFade * cyanChev;

        // orange floor edge (UV.x seam)
        float uvEdge = min(vUv.x, 1.0 - vUv.x);
        col += smoothstep(0.006, 0.0, uvEdge) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade;
        col += smoothstep(0.057, 0.0, uvEdge) * vec3(1.0, 0.38, 0.0)  * 1.6 * depthFade;
        col += smoothstep(0.076, 0.0, uvEdge) * vec3(0.9, 0.28, 0.0)  * 0.28 * depthFade;
        col += smoothstep(0.175, 0.0, uvEdge) * vec3(0.7, 0.15, 0.0)  * 0.10 * depthFade;

        // amber tile bloom
        col += tileAng * tileS * vec3(0.8, 0.22, 0.0) * 0.18 * depthFade
             * smoothstep(0.0, 1.0, 1.0 - abs(sin(angle * 22.0 + 0.5)) * 12.0 + 11.0);

        col = min(col, vec3(3.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export class InfiniteMesh {
  constructor(scene, spline, crossSection) {
    this._scene  = scene;
    this._spline = spline;
    this._cs     = crossSection;
    this._time   = 0;
    this._build();
  }

  _build() {
    const VERT_COLS = RADIAL_SEGS + 1;
    const VERT_ROWS = RING_COUNT  + 1;
    const vertCount = VERT_ROWS * VERT_COLS;

    const positions = new Float32Array(vertCount * 3);
    const normals   = new Float32Array(vertCount * 3);
    const uvs       = new Float32Array(vertCount * 2);

    // Static UVs: UV.x around circle, UV.y along tube (0=back, 1=front)
    for (let r = 0; r <= RING_COUNT; r++) {
      for (let c = 0; c <= RADIAL_SEGS; c++) {
        const vi = r * VERT_COLS + c;
        uvs[vi * 2 + 0] = c / RADIAL_SEGS;
        uvs[vi * 2 + 1] = r / RING_COUNT;
      }
    }

    // Indices
    const indices = [];
    for (let r = 0; r < RING_COUNT; r++) {
      for (let c = 0; c < RADIAL_SEGS; c++) {
        const a = r       * VERT_COLS + c;
        const b = r       * VERT_COLS + c + 1;
        const d = (r + 1) * VERT_COLS + c;
        const e = (r + 1) * VERT_COLS + c + 1;
        indices.push(a, b, e,  a, e, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
    geo.setIndex(indices);

    this._mat  = makeMaterial();
    this._mesh = new THREE.Mesh(geo, this._mat);
    this._mesh.frustumCulled = false;
    this._geo  = geo;
    this._scene.add(this._mesh);
  }

  /**
   * Called every frame. Rebuilds vertex positions from spline at rings
   * centered around playerGlobalS.
   */
  update(playerGlobalS, playerWorldPos, dt) {
    this._time += dt;

    const VERT_COLS = RADIAL_SEGS + 1;
    const pos = this._geo.attributes.position.array;
    const nor = this._geo.attributes.normal.array;

    for (let r = 0; r <= RING_COUNT; r++) {
      const ringS = playerGlobalS - BEHIND_DIST + r * RING_STEP;
      const f = this._spline.getFrameAt(ringS);
      if (!f) continue;

      // Arc span: fraction of full circle rendered, centered on floor (u=π)
      const arcSpan  = this._cs ? this._cs.getArcSpan(ringS) : 1.0;
      const uHalf    = arcSpan * Math.PI; // half-span in radians
      const uCenter  = Math.PI;           // always centered on floor

      // Twist: rotate nor/bin around forward axis by twist angle (full rotations → radians)
      const twistRot  = this._cs ? this._cs.getTwist(ringS) * Math.PI * 2 : 0;
      const cosT = Math.cos(twistRot), sinT = Math.sin(twistRot);
      // Twisted frame vectors
      const norTx = f.nor.x * cosT + f.bin.x * sinT;
      const norTy = f.nor.y * cosT + f.bin.y * sinT;
      const norTz = f.nor.z * cosT + f.bin.z * sinT;
      const binTx = -f.nor.x * sinT + f.bin.x * cosT;
      const binTy = -f.nor.y * sinT + f.bin.y * cosT;
      const binTz = -f.nor.z * sinT + f.bin.z * cosT;

      for (let c = 0; c <= RADIAL_SEGS; c++) {
        const u = uCenter - uHalf + (c / RADIAL_SEGS) * 2 * uHalf;
        const { x: cx, y: cy } = this._cs
          ? this._cs.getPoint(u, ringS, TUNNEL_R)
          : { x: TUNNEL_R * Math.cos(u), y: TUNNEL_R * Math.sin(u) };

        // World position: spline center + cross-section point in twisted frame
        const wx = f.pos.x + cx * norTx + cy * binTx;
        const wy = f.pos.y + cx * norTy + cy * binTy;
        const wz = f.pos.z + cx * norTz + cy * binTz;

        // Ball-side normal in twisted frame
        const nLocal = this._cs
          ? this._cs.getBallSideNormal(u, ringS, TUNNEL_R)
          : { nx: Math.cos(u), ny: Math.sin(u) };
        const nx = nLocal.nx * norTx + nLocal.ny * binTx;
        const ny = nLocal.nx * norTy + nLocal.ny * binTy;
        const nz = nLocal.nx * norTz + nLocal.ny * binTz;

        const vi = r * VERT_COLS + c;
        pos[vi * 3 + 0] = wx;  pos[vi * 3 + 1] = wy;  pos[vi * 3 + 2] = wz;
        nor[vi * 3 + 0] = nx;  nor[vi * 3 + 1] = ny;  nor[vi * 3 + 2] = nz;
      }
    }

    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.normal.needsUpdate   = true;

    this._mat.uniforms.time.value          = this._time;
    this._mat.uniforms.playerGlobalS.value = playerGlobalS;
    this._mat.uniforms.playerWorldPos.value.copy(playerWorldPos);
  }

  dispose() {
    this._scene.remove(this._mesh);
    this._geo.dispose();
    this._mat.dispose();
  }
}
