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
  varying vec3 vWorld;

  // Must match JS getArcHalfAngle exactly
  float arcHalfAtZ(float z) {
    float slow = sin(z * 0.009);
    float med  = sin(z * 0.038) * 0.42;
    float t = clamp((slow + med + 1.42) / 2.84, 0.0, 1.0);
    return (4.0 + t * 56.0) * 0.05236;
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

    // ---- base colour: near-black (safe) / pure black (danger) ----
    vec3 col = mix(vec3(0.008, 0.002, 0.001), vec3(0.004, 0.007, 0.015), inSafe);
    // Polished sheen near bottom
    float sheen = pow(max(0.0, 1.0 - absAngle * 1.6), 4.0);
    col += sheen * vec3(0.005, 0.012, 0.022) * inSafe;
    col *= depthFade;

    // ---- fine angular grid: 120 divisions — subtle ----
    float fineAng = smoothstep(0.91, 1.0, abs(sin(angle * 60.0)));
    col += fineAng * vec3(0.0, 0.10, 0.20) * (0.15 + inSafe * 0.85) * depthFade;

    // ---- ring seams: every ~4 m ----
    float ringSeam = smoothstep(0.94, 1.0, abs(sin(vWorld.z * 0.7854)));
    col += ringSeam * vec3(0.0, 0.10, 0.20) * inSafe * depthFade;

    // ---- coarse ring seams: every ~16 m ----
    float ringCoarse = smoothstep(0.91, 1.0, abs(sin(vWorld.z * 0.196)));
    col += ringCoarse * vec3(0.0, 0.18, 0.34) * inSafe * depthFade * 0.55;

    // ---- 8 cyan running-light strips ----
    float strip = step(0.984, abs(sin(angle * 4.0)));
    float pulse = 0.5 + 0.5 * sin(vWorld.z * 0.55 - time * 6.5);
    col += strip * inSafe * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade;

    // ---- mirror-specular glint on strips ----
    col += strip * sheen * inSafe * vec3(0.15, 0.45, 0.75) * 0.18 * depthFade;

    // ---- amber rectangular panel tiles ----
    float tileAng  = step(0.955, abs(sin(angle * 22.0 + 0.5)));
    float tileZ    = step(0.920, abs(sin(vWorld.z * 0.85)));
    float tilePulse = 0.60 + 0.40 * sin(time * 0.4 + vWorld.z * 0.1);
    col += tileAng * tileZ * inSafe * vec3(1.0, 0.45, 0.04) * 0.55 * tilePulse * depthFade;

    // ---- cyan tile variant ----
    float tileAng2 = step(0.968, abs(sin(angle * 38.0 + 1.8)));
    float tileZ2   = step(0.948, abs(sin(vWorld.z * 1.85 - time * 0.11)));
    col += tileAng2 * tileZ2 * inSafe * vec3(0.05, 0.55, 0.80) * 0.38 * depthFade;

    // ---- scrolling chevrons on floor ----
    float ground = smoothstep(0.55, 0.0, absAngle) * inSafe;
    float chev   = abs(sin(vWorld.z * 0.85 - time * 5.5));
    col += ground * step(0.86, chev) * vec3(0.0, 0.60, 0.80) * 0.28 * depthFade;

    // ---- danger zone: very dim orange grid ----
    float dangerGrid = smoothstep(0.91, 1.0, abs(sin(angle * 60.0))) * (1.0 - inSafe) * 0.35;
    col += dangerGrid * vec3(0.30, 0.04, 0.01) * depthFade;

    // ---- orange boundary glow — this stays bright ----
    col += smoothstep(0.018, 0.0, edgeDist) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade;
    col += smoothstep(0.18,  0.0, edgeDist) * inSafe       * vec3(1.0, 0.38, 0.0) * 1.6 * depthFade;
    col += smoothstep(0.24,  0.0, edgeDist) * (1.0-inSafe) * vec3(0.8, 0.14, 0.0) * 1.2 * depthFade;

    gl_FragColor = vec4(col, 1.0);
  }
`;
