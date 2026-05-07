import * as THREE from 'three';
import { BACKGROUND_SHADER_CONFIG } from './background.config.js';

const vertexShader = /* glsl */`
  precision highp float;
  
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Color ramp: black → deep red → deep purple → amber/yellow → near-white
// Matches a heat / fire gradient driven purely by energy level.
const fragmentShader = /* glsl */`
  precision highp float;
  
  varying vec2 vUv;

  // Set by JS update() — normalized current energy / smoothed baseline
  uniform float uNormEnergy;

  // Config strength multipliers
  uniform float uEnergyScale;
  uniform float uBgBassPulse;
  uniform float uBgBeatPulse;

  // Filled automatically by ShaderAudioBridge
  uniform float uBassImpact;
  uniform float uBeatPulse;

  vec3 energyRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.000, 0.000, 0.000); // black
    vec3 c1 = vec3(0.200, 0.008, 0.040); // deep crimson
    vec3 c2 = vec3(0.370, 0.020, 0.290); // deep purple
    vec3 c3 = vec3(0.860, 0.520, 0.040); // amber / yellow-orange
    vec3 c4 = vec3(1.000, 0.980, 0.900); // near white

    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.55) return mix(c1, c2, (t - 0.25) / 0.30);
    if (t < 0.80) return mix(c2, c3, (t - 0.55) / 0.25);
    return mix(c3, c4, (t - 0.80) / 0.20);
  }

  void main() {
    float pulse = uBassImpact * uBgBassPulse
                + uBeatPulse  * uBgBeatPulse;

    float rampPos = uNormEnergy * uEnergyScale + pulse;

    vec3 col = energyRamp(rampPos);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const cfg = BACKGROUND_SHADER_CONFIG;

export function createBackgroundLayer(scene) {
  const { radius, widthSegments, heightSegments } = cfg.geometry;
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);

  const s = cfg.strengths;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      // JS-computed normalized energy
      uNormEnergy:   { value: 0 },

      // Config strength uniforms
      uEnergyScale:  { value: s.energyScale },
      uBgBassPulse:  { value: s.bassPulse },
      uBgBeatPulse:  { value: s.beatPulse },

      // Audio uniforms — ShaderAudioBridge matches by name and fills these each tick
      uBassImpact:   { value: 0 },
      uBeatPulse:    { value: 0 },
      uMusicEnergy:  { value: 0 }, // read in JS update() for EMA, not used in shader
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Rolling average energy baseline for normalization
  let smoothedEnergy = 0.05;
  const alpha = cfg.energySmoothingAlpha;

  function update(elapsedTime, camera) {
    // Read raw energy that ShaderAudioBridge wrote this frame
    const rawEnergy = material.uniforms.uMusicEnergy.value;

    // Update exponential moving average
    smoothedEnergy = alpha * smoothedEnergy + (1.0 - alpha) * rawEnergy;

    // Normalize: ratio of current to baseline
    const normEnergy = rawEnergy / Math.max(smoothedEnergy, 0.01);
    material.uniforms.uNormEnergy.value = normEnergy;

    mesh.position.copy(camera.position);
  }

  return { mesh, material, update };
}
