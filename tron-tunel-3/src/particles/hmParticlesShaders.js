/**
 * Particle shaders for curl-flow GPU particles
 * Stage 1: Additive blending with curl-flow motion
 * Stage 2: Depth-aware with fog and lighting
 */

// ============================================================================
// SHARED: Curl noise and motion helper functions
// ============================================================================

const curlNoiseHelpers = `
// 3D hash function
vec3 hash3(vec3 p) {
  p = fract(p * vec3(.1031, .11369, .13787));
  p += dot(p, p.yzx + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Simple 3D Perlin-like noise
float noise3(vec3 p) {
  vec3 pi = floor(p);
  vec3 pf = fract(p);
  
  // Smooth interpolation
  vec3 u = pf * pf * (3.0 - 2.0 * pf);
  
  float n000 = dot(hash3(pi + vec3(0.0, 0.0, 0.0)), pf - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hash3(pi + vec3(1.0, 0.0, 0.0)), pf - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash3(pi + vec3(0.0, 1.0, 0.0)), pf - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash3(pi + vec3(1.0, 1.0, 0.0)), pf - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash3(pi + vec3(0.0, 0.0, 1.0)), pf - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash3(pi + vec3(1.0, 0.0, 1.0)), pf - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash3(pi + vec3(0.0, 1.0, 1.0)), pf - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash3(pi + vec3(1.0, 1.0, 1.0)), pf - vec3(1.0, 1.0, 1.0));
  
  float ny0 = mix(n000, n100, u.x);
  float ny1 = mix(n010, n110, u.x);
  float ny = mix(ny0, ny1, u.y);
  
  float ny0z = mix(n001, n101, u.x);
  float ny1z = mix(n011, n111, u.x);
  float nyz = mix(ny0z, ny1z, u.y);
  
  return mix(ny, nyz, u.z) * 0.5 + 0.5;
}

// Curl motion: sample noise at 3 offsets to approximate curl flow
vec3 curlMotion(vec3 pos, float time, float seed) {
  float freq = 0.1 + mod(seed, 1.0) * 0.2;
  float amp = 0.3 + mod(seed * 0.7, 0.4) * 0.5;
  
  vec3 p = pos * freq + vec3(seed, seed * 0.3, time * 0.5);
  
  float eps = 0.01;
  float n0 = noise3(p);
  float nx = noise3(p + vec3(eps, 0.0, 0.0));
  float ny = noise3(p + vec3(0.0, eps, 0.0));
  float nz = noise3(p + vec3(0.0, 0.0, eps));
  
  vec3 curl = normalize(vec3(ny - n0, nz - n0, nx - n0)) * amp;
  
  // Add upward drift
  curl.y += 0.2 * amp;
  
  return curl;
}

// Depth reconstruction from linear depth
float reconstructLinearDepth(float depth, float near, float far) {
  // Standard linear depth reconstruction
  float z = depth * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

// Sample depth texture and linearize
float sampleDepth(sampler2D depthTexture, vec2 uv, float near, float far) {
  float depth = texture2D(depthTexture, uv).r;
  return reconstructLinearDepth(depth, near, far);
}
`;

// ============================================================================
// VERTEX SHADER: Position and motion in 3D space
// ============================================================================

export const particlesVertexShader = `
  precision highp float;
  
  attribute float seed;
  attribute float spawnTime;
  attribute float side;
  attribute float size;
  
  uniform float time;
  uniform float elapsedTime;
  uniform float particleLifetime;
  uniform mat4 cameraMatrix;
  uniform mat4 cameraMatrixInverse;
  uniform mat4 cameraProjectionMatrix;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform float stage2Enabled;
  
  varying float vAge;
  varying float vLifetime;
  varying float vSide;
  varying float vSize;
  varying vec3 vPosition;
  varying vec4 vClipPos;
  
  ${curlNoiseHelpers}
  
  void main() {
    float lifetime = particleLifetime;
    float age = elapsedTime - spawnTime;
    vAge = age;
    vLifetime = lifetime;
    vSide = side;
    vSize = size;
    
    vec3 pos = position;
    
    // Apply curl-flow motion if particle is alive
    if (age >= 0.0 && age < lifetime) {
      vec3 motion = curlMotion(position * 0.35, elapsedTime * 0.8, seed) * age * 0.65;
      pos += motion;

      // Seeded lateral drift keeps streams coherent without world-origin expansion.
      float lateralAmp = 0.08 + 0.04 * fract(seed * 0.173);
      vec3 lateral = normalize(vec3(
        sin(seed * 0.017 + side * 3.14),
        sin(seed * 0.013 + 0.7) * 0.35,
        cos(seed * 0.017 + side * 3.14)
      ));
      pos += lateral * (age * lateralAmp);
    }
    
    vPosition = pos;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vClipPos = projectionMatrix * mvPos;
    gl_Position = vClipPos;
    
    // Point size based on distance and life
    float alphaTerm = smoothstep(lifetime, 0.0, age);
    float distTerm = max(0.5, 1.0 / (1.0 + length(mvPos.xyz) * 0.01));
    gl_PointSize = vSize * 24.0 * distTerm * (0.45 + alphaTerm * 0.55);
  }
`;

// ============================================================================
// FRAGMENT SHADER: Stage 1 (Additive) + Stage 2 (Depth-Aware)
// ============================================================================

export const particlesFragmentShader = `
  precision highp float;
  
  varying float vAge;
  varying float vLifetime;
  varying float vSide;
  varying float vSize;
  varying vec3 vPosition;
  varying vec4 vClipPos;
  
  uniform float time;
  uniform float elapsedTime;
  uniform mat4 cameraMatrix;
  uniform mat4 cameraMatrixInverse;
  uniform mat4 cameraProjectionMatrix;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform float fogDensity;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec3 fogColor;
  uniform vec3 lightPosition;
  uniform sampler2D depthTexture;
  uniform float stage2Enabled;
  
  ${curlNoiseHelpers}
  
  void main() {
    // Discard particles outside lifetime
    if (vAge < 0.0 || vAge > vLifetime) discard;
    
    // Create soft circular point sprite
    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
    float dist = length(uv);
    if (dist > 1.0) discard;
    
    float softness = smoothstep(1.0, 0.0, dist);
    softness *= softness;
    float lifeFade = smoothstep(vLifetime, 0.0, vAge);
    
    // Base color: bright cyan-ish with pulsing
    vec3 color = vec3(0.0, 0.8, 1.0);
    float pulse = 0.5 + 0.5 * sin(elapsedTime * 2.2 + vSide * 100.0);
    color *= 0.78 + pulse * 0.22;
    
    // Stage 1: Simple additive blending
    if (stage2Enabled < 0.5) {
      float alpha = softness * lifeFade * 0.62;
      gl_FragColor = vec4(color, alpha);
      return;
    }
    
    // Stage 2: Depth-aware with fog
    
    // Reconstruct depth from gl_FragCoord
    vec2 screenUV = gl_FragCoord.xy / vec2(1024.0, 768.0); // Fallback: will be set by app
    
    // Linear depth of this particle
    float particleDepth = distance(vPosition, cameraPosition);
    
    // Fog calculation
    float fogDistance = particleDepth - fogNear;
    float fogAmount = 0.0;
    if (fogDistance > 0.0) {
      fogDistance = min(fogDistance, fogFar - fogNear);
      fogAmount = 1.0 - exp(-fogDistance * fogDensity * 0.1);
    }
    
    // Optional: simplified shadow/lighting (distance-based darkening near light)
    float lightDist = distance(vPosition, lightPosition);
    float lightTerm = 1.0 - smoothstep(0.0, 30.0, lightDist) * 0.3;
    
    // Apply fog and lighting
    vec3 finalColor = mix(color * lightTerm, fogColor, fogAmount);
    float alpha = softness * lifeFade * (0.62 - fogAmount * 0.24);
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================================================
// Stage 2 Dedicated Shading (for future enhancement)
// ============================================================================

export const particlesFragmentShaderStage2 = `
  precision highp float;
  
  varying float vAge;
  varying float vLifetime;
  varying float vSide;
  varying float vSize;
  varying vec3 vPosition;
  varying vec4 vClipPos;
  
  uniform float time;
  uniform float elapsedTime;
  uniform mat4 cameraMatrix;
  uniform mat4 cameraMatrixInverse;
  uniform mat4 cameraProjectionMatrix;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform float fogDensity;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec3 fogColor;
  uniform vec3 lightPosition;
  uniform sampler2D depthTexture;
  
  ${curlNoiseHelpers}
  
  void main() {
    if (vAge < 0.0 || vAge > vLifetime) discard;
    
    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
    float dist = length(uv);
    if (dist > 1.0) discard;
    
    float softness = smoothstep(1.0, 0.0, dist);
    softness *= softness;
    float lifeFade = smoothstep(vLifetime, 0.0, vAge);
    
    vec3 color = vec3(0.0, 0.8, 1.0);
    float pulse = 0.5 + 0.5 * sin(elapsedTime * 2.2 + vSide * 100.0);
    color *= 0.78 + pulse * 0.22;
    
    // Depth-aware occlusion and fog
    float particleDepth = distance(vPosition, cameraPosition);
    
    // Fog calculation with distance attenuation
    float fogDistance = max(0.0, particleDepth - fogNear);
    float fogAmount = 1.0 - exp(-fogDistance * fogDistance * fogDensity * 0.001);
    
    // Light response
    float lightDist = distance(vPosition, lightPosition);
    float lightTerm = 1.0 - smoothstep(0.0, 40.0, lightDist) * 0.4;
    
    vec3 finalColor = mix(color * lightTerm, fogColor, fogAmount);
    float alpha = softness * lifeFade * (0.58 - fogAmount * 0.25);
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;
