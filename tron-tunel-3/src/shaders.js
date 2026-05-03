export const tunnelVertexShader = /* glsl */`
  varying vec3 vWorld;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const tunnelFragmentShader = /* glsl */`
  uniform float time;
  uniform float playerZ;
  uniform float playerTheta;

  varying vec3 vWorld;

  // Must match JS getArcHalfAngle exactly
  float arcHalfAtZ(float z) {
    float slow = sin(z * 0.009);
    float med  = sin(z * 0.038) * 0.42;
    float t = clamp((slow + med + 1.42) / 2.84, 0.0, 1.0);
    return (4.0 + t * 56.0) * 0.05236;
  }

  float angleDist(float a, float b) {
    return abs(atan(sin(a - b), cos(a - b)));
  }

  void main() {
    float angle    = atan(vWorld.x, -vWorld.y);
    float absAngle = abs(angle);
    float arcH     = arcHalfAtZ(vWorld.z);
    float inSafe   = step(absAngle, arcH);
    float edgeDist = abs(absAngle - arcH);

    // Depth fade — closer = brighter
    float dz        = abs(vWorld.z - playerZ);
    float depthFade = 0.55 + 0.45 * exp(-dz * 0.009);

    // ---- cyan per-element breathe: different frequencies so they never sync ----
    float cyanGrid    = pow(max(0.0, sin(time * 0.53 + 0.0)),  2.2);
    float cyanRing    = pow(max(0.0, sin(time * 0.41 + 1.9)),  2.2);
    float cyanStrip   = pow(max(0.0, sin(time * 0.67 + 0.7)),  2.2);
    float cyanTile2   = pow(max(0.0, sin(time * 0.31 + 3.1)),  2.2);
    float cyanChev    = pow(max(0.0, sin(time * 0.47 + 5.4)),  2.2);

    // ---- base colour: near-black safe / pure dark danger ----
    vec3 col = mix(
      vec3(0.008, 0.002, 0.001),
      vec3(0.004, 0.007, 0.015),
      inSafe
    );

    // Polished sheen near bottom
    float sheen = pow(max(0.0, 1.0 - absAngle * 1.6), 4.0);
    col += sheen * vec3(0.005, 0.012, 0.022) * inSafe;
    col *= depthFade;

    // -------------------------------------------------------------------------
    // LAVA LAMP BACKGROUND — stronger, visible, still behind all grid/tile layers
    // -------------------------------------------------------------------------
    // Old version was almost invisible because:
    // - smoothstep thresholds were too narrow,
    // - multiplier was only ~0.22,
    // - lavaPulse could drop close to 0,
    // - later grid/boundary layers visually dominated it.
    //
    // This version uses broader masks + non-zero pulse floor.
    // It is intentionally placed before grid/tile layers.
    // -------------------------------------------------------------------------

    float lv1 =
        sin(angle * 1.45 + vWorld.z * 0.085 + time * 0.20) * 0.42
      + sin(angle * 2.30 - vWorld.z * 0.061 + time * 0.13) * 0.31
      + sin(angle * 0.85 + vWorld.z * 0.039 - time * 0.18) * 0.36
      + sin(angle * 3.55 - vWorld.z * 0.026 - time * 0.10) * 0.22;

    float lv2 =
        sin(angle * 1.10 - vWorld.z * 0.115 - time * 0.15) * 0.38
      + sin(angle * 2.85 + vWorld.z * 0.052 + time * 0.17) * 0.29
      + sin(angle * 4.20 - vWorld.z * 0.031 + time * 0.08) * 0.20;

    float lavaRaw1 = lv1 * 0.5 + 0.5;
    float lavaRaw2 = lv2 * 0.5 + 0.5;

    // Broad soft blobs
    float lavaBlob1 = smoothstep(0.18, 0.72, lavaRaw1);
    float lavaBlob2 = smoothstep(0.22, 0.78, lavaRaw2);

    // Secondary inner hot zones
    float lavaHot1 = smoothstep(0.58, 0.92, lavaRaw1);
    float lavaHot2 = smoothstep(0.62, 0.95, lavaRaw2);

    // Soft borders, so the layer reads as organic stains, not flat noise.
    float lavaEdge1 = smoothstep(0.30, 0.58, lavaRaw1) * (1.0 - smoothstep(0.78, 0.96, lavaRaw1));
    float lavaEdge2 = smoothstep(0.28, 0.62, lavaRaw2) * (1.0 - smoothstep(0.80, 0.98, lavaRaw2));

    // Never drop to zero.
    float lavaPulse = 0.72 + 0.28 * sin(time * 0.23 + 1.3);

    // Colour layers: deep amber, orange, slight magenta contamination.
    vec3 lavaDark = vec3(0.55, 0.10, 0.015);
    vec3 lavaMid  = vec3(0.95, 0.22, 0.025);
    vec3 lavaHot  = vec3(1.00, 0.48, 0.08);
    vec3 lavaMag  = vec3(0.42, 0.035, 0.18);

    vec3 lavaCol =
        lavaDark * lavaBlob1 * 0.45
      + lavaMid  * lavaBlob2 * 0.38
      + lavaHot  * (lavaHot1 + lavaHot2) * 0.32
      + lavaMag  * lavaEdge2 * 0.22;

    // Angular falloff: slightly stronger near lower/front readable surface.
    float lavaReadableZone = 0.60 + 0.40 * pow(max(0.0, 1.0 - absAngle * 0.42), 2.0);

    // Main lava contribution.
    col += lavaCol * inSafe * depthFade * lavaPulse * lavaReadableZone * 0.72;

    // Very soft large-area glow so blobs remain visible between grid lines.
    float lavaAmbient = (lavaBlob1 * 0.55 + lavaBlob2 * 0.45);
    col += vec3(0.42, 0.08, 0.015) * lavaAmbient * inSafe * depthFade * 0.22;

    // -------------------------------------------------------------------------
    // BALL REFLECTION / CONTACT GLOW UNDER PLAYER
    // -------------------------------------------------------------------------
    // Fake reflection projected onto tunnel surface.
    // Requires JS uniform: playerTheta = state.carTheta
    // -------------------------------------------------------------------------

    float ballAngDist = angleDist(angle, playerTheta);
    float ballZDist   = abs(vWorld.z - playerZ);

    // Elliptical footprint: narrow around tunnel angle, longer along Z.
    float reflAng  = exp(-ballAngDist * ballAngDist * 42.0);
    float reflZ    = exp(-ballZDist   * ballZDist   * 0.18);
    float reflMask = reflAng * reflZ * inSafe;

    // Wider soft skirt.
    float reflWideAng  = exp(-ballAngDist * ballAngDist * 16.0);
    float reflWideZ    = exp(-ballZDist   * ballZDist   * 0.055);
    float reflWideMask = reflWideAng * reflWideZ * inSafe;

    float reflNoise =
        sin(vWorld.z * 2.2 + angle * 18.0 + time * 3.5) * 0.5
      + sin(vWorld.z * 4.7 - angle * 11.0 - time * 2.1) * 0.5;

    float shimmer = 0.82 + 0.18 * reflNoise;

    // Dark glossy oval.
    col += reflWideMask * vec3(0.01, 0.025, 0.035) * 0.85 * depthFade;

    // Cyan-white reflected core.
    col += reflMask * vec3(0.35, 0.95, 1.00) * 1.35 * shimmer * depthFade;

    // Tight contact glint directly under ball.
    float contact = exp(-ballAngDist * ballAngDist * 90.0)
                  * exp(-ballZDist   * ballZDist   * 0.55)
                  * inSafe;

    col += contact * vec3(0.95, 1.00, 1.00) * 1.25 * depthFade;

    // Faint yellow pickup from boost ribbon / trail.
    float yellowRefl = reflWideMask * (0.45 + 0.55 * sin(time * 7.0 + vWorld.z * 0.9));
    col += yellowRefl * vec3(1.0, 0.95, 0.0) * 0.12 * depthFade;

    // ---- fine angular grid: 120 divisions — breathes with cyan ----
    float fineAng = smoothstep(0.91, 1.0, abs(sin(angle * 60.0)));
    col += fineAng * vec3(0.0, 0.10, 0.20) * (0.15 + inSafe * 0.85) * depthFade * cyanGrid;

    // ---- ring seams: every ~4 m ----
    float ringSeam = smoothstep(0.94, 1.0, abs(sin(vWorld.z * 0.7854)));
    col += ringSeam * vec3(0.0, 0.10, 0.20) * inSafe * depthFade * cyanRing;

    // ---- coarse ring seams: every ~16 m ----
    float ringCoarse = smoothstep(0.91, 1.0, abs(sin(vWorld.z * 0.196)));
    col += ringCoarse * vec3(0.0, 0.18, 0.34) * inSafe * depthFade * 0.55 * cyanRing;

    // ---- 8 cyan running-light strips ----
    float strip = step(0.984, abs(sin(angle * 4.0)));
    float pulse = 0.5 + 0.5 * sin(vWorld.z * 0.55 - time * 6.5);
    col += strip * inSafe * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip;

    // ---- mirror-specular glint on strips ----
    col += strip * sheen * inSafe * vec3(0.15, 0.45, 0.75) * 0.18 * depthFade * cyanStrip;

    // ---- amber rectangular panel tiles — always on ----
    float tileAng  = step(0.955, abs(sin(angle * 22.0 + 0.5)));
    float tileZ    = step(0.920, abs(sin(vWorld.z * 0.85)));
    col += tileAng * tileZ * inSafe * vec3(1.0, 0.45, 0.04) * 0.65 * depthFade;

    // ---- cyan tile variant — breathes ----
    float tileAng2 = step(0.968, abs(sin(angle * 38.0 + 1.8)));
    float tileZ2   = step(0.948, abs(sin(vWorld.z * 1.85 - time * 0.11)));
    col += tileAng2 * tileZ2 * inSafe * vec3(0.05, 0.55, 0.80) * 0.38 * depthFade * cyanTile2;

    // ---- scrolling chevrons on floor ----
    float ground = smoothstep(0.55, 0.0, absAngle) * inSafe;
    float chev   = abs(sin(vWorld.z * 0.85 - time * 5.5));
    col += ground * step(0.86, chev) * vec3(0.0, 0.60, 0.80) * 0.28 * depthFade * cyanChev;

    // ---- danger zone: dim orange grid ----
    float dangerGrid = smoothstep(0.91, 1.0, abs(sin(angle * 60.0))) * (1.0 - inSafe) * 0.35;
    col += dangerGrid * vec3(0.30, 0.04, 0.01) * depthFade;

    // ---- orange boundary glow — always bright ----
    col += smoothstep(0.018, 0.0, edgeDist) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade;

    col += smoothstep(0.18, 0.0, edgeDist)
         * inSafe
         * vec3(1.0, 0.38, 0.0)
         * 1.6
         * depthFade;

    col += smoothstep(0.24, 0.0, edgeDist)
         * (1.0 - inSafe)
         * vec3(0.8, 0.14, 0.0)
         * 1.2
         * depthFade;

    // bloom — wide soft halo layers
    col += smoothstep(0.55, 0.0, edgeDist) * vec3(0.9, 0.28, 0.0) * 0.28 * depthFade;
    col += smoothstep(1.10, 0.0, edgeDist) * vec3(0.7, 0.15, 0.0) * 0.10 * depthFade;

    // ---- amber tile bloom — soft orange corona ----
    col += tileAng * tileZ * inSafe * vec3(0.8, 0.22, 0.0) * 0.18 * depthFade
         * smoothstep(0.0, 1.0, 1.0 - abs(sin(angle * 22.0 + 0.5)) * 12.0 + 11.0);

    // Soft clamp. Keeps additive effects from exploding into pure white too easily.
    col = min(col, vec3(3.2));

    gl_FragColor = vec4(col, 1.0);
  }
`;