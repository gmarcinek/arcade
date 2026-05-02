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
    // angle=0 at tunnel bottom (where car starts, carTheta=0)
    float angle    = atan(vWorld.x, -vWorld.y);
    float absAngle = abs(angle);
    float localArcH = arcHalfAtZ(vWorld.z);
    float inSafe    = step(absAngle, localArcH);

    // base colour: bright inside arc, dark danger outside
    vec3 col = mix(vec3(0.07, 0.01, 0.01), vec3(0.045, 0.065, 0.115), inSafe);

    // panel ridges (120 per circle = 1 per lane)
    float panel = abs(sin(angle * 60.0));
    col += smoothstep(0.90, 1.0, panel) * vec3(0.14, 0.20, 0.30) * (0.25 + inSafe * 0.75);

    // longitudinal ring seams
    float ring = abs(sin(vWorld.z * 0.7854));
    col += smoothstep(0.96, 1.0, ring) * vec3(0.10, 0.18, 0.30) * inSafe;

    // 8 cyan running-light strips (safe zone only)
    float strip = step(0.985, abs(sin(angle * 4.0)));
    float pulse = sin(vWorld.z * 0.55 - time * 6.0);
    pulse = smoothstep(0.25, 1.0, pulse);
    col += strip * inSafe * vec3(0.0, 0.75, 1.0) * (0.45 + pulse * 0.7);

    // amber dot lights
    float aDot = step(0.992, abs(sin(angle * 16.0 + 0.4)));
    float zDot = step(0.94, abs(sin(vWorld.z * 1.3)));
    col += aDot * zDot * inSafe * vec3(1.0, 0.55, 0.08) * 0.9;

    // scrolling chevrons on the floor
    float ground = smoothstep(0.7, 0.0, absAngle) * inSafe;
    float chev   = abs(sin(vWorld.z * 0.85 - time * 5.0));
    col += ground * step(0.90, chev) * vec3(0.0, 0.85, 1.0) * 0.55;

    // orange warning glow at arc boundary
    float edgeDist = abs(absAngle - localArcH);
    col += smoothstep(0.14, 0.0, edgeDist) * vec3(1.0, 0.38, 0.0) * 1.1;

    // depth fade
    col *= 0.85 + 0.15 * smoothstep(80.0, 0.0, abs(vWorld.z - playerZ - 30.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;
