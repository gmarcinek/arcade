/**
 * Postprocess shader strings for DOF, FXAA, and Vignette
 * Inlined GLSL for direct use with ShaderMaterial
 */

// ============================================================================
// FULLSCREEN QUAD VERTEX SHADER (shared by all postprocess passes)
// ============================================================================

export const fullscreenVertexShader = `
  precision highp float;
  
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ============================================================================
// DOF: Separable Gaussian Blur (Horizontal + Vertical)
// ============================================================================

export const dofHorizontalShader = `
  precision highp float;
  
  varying vec2 vUv;
  
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform vec2 uDelta;
  uniform float uDofDistance;
  uniform float uDofNearAmount;
  uniform float uDofFarAmount;
  uniform float uDofFocalRange;
  uniform float uDofMaxRadius;
  uniform float uNear;
  uniform float uFar;
  
  float linearizeDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }
  
  void main() {
    vec2 texelSize = 1.0 / uResolution;
    
    // Get depth at center pixel
    float centerDepth = linearizeDepth(texture2D(tDepth, vUv).r);
    
    // Calculate blur radius with asymmetric near/far amounts and focal deadzone
    float signedDelta = centerDepth - uDofDistance;
    float absDelta = max(abs(signedDelta) - uDofFocalRange, 0.0);
    float amount = signedDelta < 0.0 ? uDofNearAmount : uDofFarAmount;
    float blurRadius = min(absDelta * amount, uDofMaxRadius);
    
    vec4 color = vec4(0.0);

    color += texture2D(tDiffuse, vUv + uDelta * (-5.0 * blurRadius) * texelSize) * 0.0093;
    color += texture2D(tDiffuse, vUv + uDelta * (-4.0 * blurRadius) * texelSize) * 0.028002;
    color += texture2D(tDiffuse, vUv + uDelta * (-3.0 * blurRadius) * texelSize) * 0.065984;
    color += texture2D(tDiffuse, vUv + uDelta * (-2.0 * blurRadius) * texelSize) * 0.121703;
    color += texture2D(tDiffuse, vUv + uDelta * (-1.0 * blurRadius) * texelSize) * 0.175713;
    color += texture2D(tDiffuse, vUv) * 0.198596;
    color += texture2D(tDiffuse, vUv + uDelta * (1.0 * blurRadius) * texelSize) * 0.175713;
    color += texture2D(tDiffuse, vUv + uDelta * (2.0 * blurRadius) * texelSize) * 0.121703;
    color += texture2D(tDiffuse, vUv + uDelta * (3.0 * blurRadius) * texelSize) * 0.065984;
    color += texture2D(tDiffuse, vUv + uDelta * (4.0 * blurRadius) * texelSize) * 0.028002;
    color += texture2D(tDiffuse, vUv + uDelta * (5.0 * blurRadius) * texelSize) * 0.0093;

    gl_FragColor = color;
  }
`;

export const dofVerticalShader = `
  precision highp float;
  
  varying vec2 vUv;
  
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform vec2 uDelta;
  uniform float uDofDistance;
  uniform float uDofNearAmount;
  uniform float uDofFarAmount;
  uniform float uDofFocalRange;
  uniform float uDofMaxRadius;
  uniform float uNear;
  uniform float uFar;
  
  float linearizeDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }
  
  void main() {
    vec2 texelSize = 1.0 / uResolution;
    
    // Get depth at center pixel
    float centerDepth = linearizeDepth(texture2D(tDepth, vUv).r);
    
    // Calculate blur radius with asymmetric near/far amounts and focal deadzone
    float signedDelta = centerDepth - uDofDistance;
    float absDelta = max(abs(signedDelta) - uDofFocalRange, 0.0);
    float amount = signedDelta < 0.0 ? uDofNearAmount : uDofFarAmount;
    float blurRadius = min(absDelta * amount, uDofMaxRadius);
    
    vec4 color = vec4(0.0);

    color += texture2D(tDiffuse, vUv + uDelta * (-5.0 * blurRadius) * texelSize) * 0.0093;
    color += texture2D(tDiffuse, vUv + uDelta * (-4.0 * blurRadius) * texelSize) * 0.028002;
    color += texture2D(tDiffuse, vUv + uDelta * (-3.0 * blurRadius) * texelSize) * 0.065984;
    color += texture2D(tDiffuse, vUv + uDelta * (-2.0 * blurRadius) * texelSize) * 0.121703;
    color += texture2D(tDiffuse, vUv + uDelta * (-1.0 * blurRadius) * texelSize) * 0.175713;
    color += texture2D(tDiffuse, vUv) * 0.198596;
    color += texture2D(tDiffuse, vUv + uDelta * (1.0 * blurRadius) * texelSize) * 0.175713;
    color += texture2D(tDiffuse, vUv + uDelta * (2.0 * blurRadius) * texelSize) * 0.121703;
    color += texture2D(tDiffuse, vUv + uDelta * (3.0 * blurRadius) * texelSize) * 0.065984;
    color += texture2D(tDiffuse, vUv + uDelta * (4.0 * blurRadius) * texelSize) * 0.028002;
    color += texture2D(tDiffuse, vUv + uDelta * (5.0 * blurRadius) * texelSize) * 0.0093;

    gl_FragColor = color;
  }
`;

// ============================================================================
// FXAA: Fast Approximate Anti-Aliasing
// ============================================================================

export const fxaaShader = `
  precision highp float;
  
  varying vec2 vUv;
  
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  
  const float FXAA_REDUCE_MIN = 1.0 / 128.0;
  const float FXAA_REDUCE_MUL = 1.0 / 8.0;
  const float FXAA_SPAN_MAX = 8.0;
  
  vec4 fxaa(sampler2D tex, vec2 uv, vec2 texelSize) {
    vec3 rgbNW = texture2D(tex, uv + vec2(-1.0, -1.0) * texelSize).xyz;
    vec3 rgbNE = texture2D(tex, uv + vec2(1.0, -1.0) * texelSize).xyz;
    vec3 rgbSW = texture2D(tex, uv + vec2(-1.0, 1.0) * texelSize).xyz;
    vec3 rgbSE = texture2D(tex, uv + vec2(1.0, 1.0) * texelSize).xyz;
    vec3 rgbM = texture2D(tex, uv).xyz;
    
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lumaNW = dot(rgbNW, luma);
    float lumaNE = dot(rgbNE, luma);
    float lumaSW = dot(rgbSW, luma);
    float lumaSE = dot(rgbSE, luma);
    float lumaM = dot(rgbM, luma);
    
    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    
    vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), 
                     ((lumaNW + lumaSW) - (lumaNE + lumaSE)));
    
    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.25 * FXAA_REDUCE_MUL, FXAA_REDUCE_MIN);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    
    dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
              max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * texelSize;
    
    vec3 rgbA = 0.5 * (texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).xyz +
                       texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).xyz);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tex, uv + dir * -0.5).xyz +
                                     texture2D(tex, uv + dir * 0.5).xyz);
    
    float lumaB = dot(rgbB, luma);
    if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
      return vec4(rgbA, 1.0);
    } else {
      return vec4(rgbB, 1.0);
    }
  }
  
  void main() {
    vec2 texelSize = 1.0 / uResolution;
    gl_FragColor = fxaa(tDiffuse, vUv, texelSize);
  }
`;

// ============================================================================
// VIGNETTE: Darkening Falloff
// ============================================================================

export const vignetteShader = `
  precision highp float;
  
  varying vec2 vUv;
  
  uniform sampler2D tDiffuse;
  uniform float uVignetteRadius;
  uniform float uVignetteIntensity;
  
  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    
    // Distance from center
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered) / 1.414; // Normalize to max distance
    
    // Smooth falloff from center
    float vignette = 1.0 - smoothstep(uVignetteRadius - 0.1, uVignetteRadius + 0.1, dist);
    vignette = mix(1.0, vignette, uVignetteIntensity);
    
    gl_FragColor = vec4(color.rgb * vignette, color.a);
  }
`;

// ============================================================================
// PASSTHROUGH: Simple copy (used for final blit to screen)
// ============================================================================

export const passthroughShader = `
  precision highp float;
  
  varying vec2 vUv;
  
  uniform sampler2D tDiffuse;
  
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }
`;

// ============================================================================
// HUE: subtle animated hue shift
// ============================================================================

export const hueShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uPeriod;
  uniform float uIntensity;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uBrightness;
  uniform float uMidtonesContrast;

  vec3 hueShift(vec3 color, float angle) {
    const vec3 k = vec3(0.57735026);
    float c = cos(angle);
    float s = sin(angle);
    return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
  }

  void main() {
    vec4 src = texture2D(tDiffuse, vUv);

    // hue shift
    float phase = (uTime / max(uPeriod, 0.0001)) * 6.2831853;
    float angle = sin(phase) * 0.314; // max 18 degrees shift
    vec3 shifted = hueShift(src.rgb, angle);
    vec3 outColor = mix(src.rgb, shifted, clamp(uIntensity, 0.0, 1.0));

    // saturation (1.0 = no change, 0.0 = grayscale, >1.0 = oversaturated)
    float luma = dot(outColor, vec3(0.299, 0.587, 0.114));
    outColor = mix(vec3(luma), outColor, uSaturation);

    // contrast (1.0 = no change)
    outColor = (outColor - 0.5) * uContrast + 0.5;

    // brightness (-1..1, 0 = no change)
    outColor = outColor + uBrightness;

    // midtones contrast (0 = no change, positive = more contrast in mids)
    float midLuma = dot(outColor, vec3(0.299, 0.587, 0.114));
    float midMask = 1.0 - abs(clamp(midLuma, 0.0, 1.0) - 0.5) * 2.0;
    outColor = outColor + (outColor - 0.5) * uMidtonesContrast * midMask;

    gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), src.a);
  }
`;

// ============================================================================
// BLACK & WHITE
// ============================================================================

export const blackAndWhiteShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform float uIntensity; // 0 = oryginał, 1 = pełny B&W

  void main() {
    vec4 src = texture2D(tDiffuse, vUv);
    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(mix(src.rgb, vec3(luma), clamp(uIntensity, 0.0, 1.0)), src.a);
  }
`;

// ============================================================================
// GRAIN
// ============================================================================

export const grainShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uNoiseAmount;
  uniform float uGrainAmount;
  uniform float uGlitchAmount;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 uv = vUv;
    float splitAmount = clamp(uGlitchAmount, 0.0, 1.0);

    // Simple chromatic split instead of glitch artifacts.
    vec2 centerDir = uv - 0.5;
    float d = max(length(centerDir), 0.0001);
    vec2 dir = centerDir / d;
    float wobble = 0.8 + 0.2 * sin(uTime * 2.7);
    vec2 rgbShift = dir * (0.004 + 0.008 * splitAmount) * splitAmount * wobble;

    vec4 src = vec4(
      texture2D(tDiffuse, fract(uv + rgbShift)).r,
      texture2D(tDiffuse, uv).g,
      texture2D(tDiffuse, fract(uv - rgbShift)).b,
      texture2D(tDiffuse, uv).a
    );

    vec2 nUv = uv * vec2(1920.0, 1080.0) + vec2(uTime * 37.13, uTime * 91.73);
    float n0 = hash12(nUv);
    float n1 = hash12(nUv * 1.73 + 11.0);
    float whiteNoise = (n0 - 0.5) * 2.0;
    float grain = ((n0 + n1) * 0.5 - 0.5) * 2.0;

    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    float midMask = 1.0 - abs(luma - 0.5) * 2.0;
    float noiseMix = whiteNoise * uNoiseAmount;
    float grainMix = grain * uGrainAmount * midMask;

    vec3 outColor = clamp(src.rgb + vec3(noiseMix + grainMix), 0.0, 1.0);
    gl_FragColor = vec4(outColor, src.a);
  }
`;

// ============================================================================
// INVERT
// ============================================================================

export const invertShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform float uIntensity;
  uniform float uContrast;
  uniform float uBrightness;
  uniform float uMidtonesContrast;

  void main() {
    vec4 src = texture2D(tDiffuse, vUv);

    // invert
    vec3 outColor = mix(src.rgb, 1.0 - src.rgb, uIntensity);

    // contrast (1.0 = no change) — scaled by intensity so no effect when pass is off
    vec3 contrasted = (outColor - 0.5) * uContrast + 0.5;
    outColor = mix(outColor, contrasted, uIntensity);

    // brightness — scaled by intensity
    outColor = outColor + uBrightness * uIntensity;

    // midtones contrast — scaled by intensity
    float midLuma = dot(outColor, vec3(0.299, 0.587, 0.114));
    float midMask = 1.0 - abs(clamp(midLuma, 0.0, 1.0) - 0.5) * 2.0;
    outColor = outColor + (outColor - 0.5) * uMidtonesContrast * midMask * uIntensity;

    gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), src.a);
  }
`;