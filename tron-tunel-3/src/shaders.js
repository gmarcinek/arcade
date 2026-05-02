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

    // ---- cyan per-element breathe: different frequencies so they never sync ----
    // pow(..., 2.2) sharpens the dip — spends more time near zero, snaps bright quickly
    float cyanGrid    = pow(max(0.0, sin(time * 0.53 + 0.0)),  2.2);  // grid     ~11.8 s
    float cyanRing    = pow(max(0.0, sin(time * 0.41 + 1.9)),  2.2);  // ring     ~15.3 s
    float cyanStrip   = pow(max(0.0, sin(time * 0.67 + 0.7)),  2.2);  // strips   ~9.4 s
    float cyanTile2   = pow(max(0.0, sin(time * 0.31 + 3.1)),  2.2);  // tiles    ~20.3 s
    float cyanChev    = pow(max(0.0, sin(time * 0.47 + 5.4)),  2.2);  // chevrons ~13.4 s

    // ---- base colour: near-black (safe) / pure black (danger) ----
    vec3 col = mix(vec3(0.008, 0.002, 0.001), vec3(0.004, 0.007, 0.015), inSafe);
    // Polished sheen near bottom
    float sheen = pow(max(0.0, 1.0 - absAngle * 1.6), 4.0);
    col += sheen * vec3(0.005, 0.012, 0.022) * inSafe;
    col *= depthFade;

    // ---- lava lamp: organic slow blobs — third background plane ----
    // Four overlapping sine harmonics in angular+Z space create smooth blob boundaries
    float lv = sin(angle * 1.8  + vWorld.z * 0.11  + time * 0.17) * 0.42
             + sin(angle * 2.9  - vWorld.z * 0.083 + time * 0.11) * 0.28
             + sin(angle * 0.95 + vWorld.z * 0.057 - time * 0.19) * 0.36
             + sin(angle * 3.7  - vWorld.z * 0.042 - time * 0.09) * 0.22;
    // remap to [0,1] and sharpen into soft blobs
    float lavaBlob = smoothstep(0.18, 0.68, lv * 0.5 + 0.5);
    // second blob layer at different scale for complexity
    float lv2 = sin(angle * 1.3  + vWorld.z * 0.14  - time * 0.13) * 0.38
              + sin(angle * 2.2  - vWorld.z * 0.062 + time * 0.16) * 0.32
              + sin(angle * 4.1  + vWorld.z * 0.031 - time * 0.07) * 0.18;
    float lavaBlob2 = smoothstep(0.22, 0.72, lv2 * 0.5 + 0.5);
    // slow pulse on entire layer
    float lavaPulse = 0.55 + 0.45 * sin(time * 0.23 + 1.3);
    // deep dark amber + hint of magenta — very dim, purely atmospheric
    vec3 lavaCol = mix(vec3(0.35, 0.08, 0.02), vec3(0.22, 0.04, 0.14), lavaBlob2);
    col += lavaCol * lavaBlob * 0.22 * lavaPulse * inSafe * depthFade;

    // ---- fine angular grid: 120 divisions — breathes with cyan ----
    float fineAng = smoothstep(0.91, 1.0, abs(sin(angle * 60.0)));
    col += fineAng * vec3(0.0, 0.10, 0.20) * (0.15 + inSafe * 0.85) * depthFade * cyanGrid;

    // ---- ring seams: every ~4 m ----
    float ringSeam = smoothstep(0.94, 1.0, abs(sin(vWorld.z * 0.7854)));
    col += ringSeam * vec3(0.0, 0.10, 0.20) * inSafe * depthFade * cyanRing;

    // ---- coarse ring seams: every ~16 m ----
    float ringCoarse = smoothstep(0.91, 1.0, abs(sin(vWorld.z * 0.196)));
    col += ringCoarse * vec3(0.0, 0.18, 0.34) * inSafe * depthFade * 0.55 * cyanRing;

    // ---- 8 cyan running-light strips — breathe, local pulse still rides on top ----
    float strip = step(0.984, abs(sin(angle * 4.0)));
    float pulse = 0.5 + 0.5 * sin(vWorld.z * 0.55 - time * 6.5);
    col += strip * inSafe * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip;

    // ---- mirror-specular glint on strips ----
    col += strip * sheen * inSafe * vec3(0.15, 0.45, 0.75) * 0.18 * depthFade * cyanStrip;

    // ---- amber rectangular panel tiles — always on, no pulse ----
    float tileAng  = step(0.955, abs(sin(angle * 22.0 + 0.5)));
    float tileZ    = step(0.920, abs(sin(vWorld.z * 0.85)));
    col += tileAng * tileZ * inSafe * vec3(1.0, 0.45, 0.04) * 0.65 * depthFade;

    // ---- cyan tile variant — breathes ----
    float tileAng2 = step(0.968, abs(sin(angle * 38.0 + 1.8)));
    float tileZ2   = step(0.948, abs(sin(vWorld.z * 1.85 - time * 0.11)));
    col += tileAng2 * tileZ2 * inSafe * vec3(0.05, 0.55, 0.80) * 0.38 * depthFade * cyanTile2;

    // ---- scrolling chevrons on floor — breathe ----
    float ground = smoothstep(0.55, 0.0, absAngle) * inSafe;
    float chev   = abs(sin(vWorld.z * 0.85 - time * 5.5));
    col += ground * step(0.86, chev) * vec3(0.0, 0.60, 0.80) * 0.28 * depthFade * cyanChev;

    // ---- danger zone: dim orange grid — always on ----
    float dangerGrid = smoothstep(0.91, 1.0, abs(sin(angle * 60.0))) * (1.0 - inSafe) * 0.35;
    col += dangerGrid * vec3(0.30, 0.04, 0.01) * depthFade;

    // ---- orange boundary glow — always bright ----
    // tight white-hot core
    col += smoothstep(0.018, 0.0, edgeDist) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade;
    // mid orange
    col += smoothstep(0.18,  0.0, edgeDist) * inSafe       * vec3(1.0, 0.38, 0.0) * 1.6 * depthFade;
    col += smoothstep(0.24,  0.0, edgeDist) * (1.0-inSafe) * vec3(0.8, 0.14, 0.0) * 1.2 * depthFade;
    // bloom — wide soft halo layers
    col += smoothstep(0.55, 0.0, edgeDist) * vec3(0.9, 0.28, 0.0) * 0.28 * depthFade;
    col += smoothstep(1.10, 0.0, edgeDist) * vec3(0.7, 0.15, 0.0) * 0.10 * depthFade;

    // ---- amber tile bloom — soft orange corona ----
    col += tileAng * tileZ * inSafe * vec3(0.8, 0.22, 0.0) * 0.18 * depthFade
         * smoothstep(0.0, 1.0, 1.0 - abs(sin(angle * 22.0 + 0.5)) * 12.0 + 11.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;


