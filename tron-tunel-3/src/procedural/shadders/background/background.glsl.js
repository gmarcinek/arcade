import * as THREE from 'three';
import { BACKGROUND_SHADER_CONFIG } from './background.config.js';

// Vertex: przekazuje znormalizowany wektor kierunku zamiast UV
// — sfera jest bezszwowa (żaden punkt 3D nie jest "krawędzią")
const vertexShader = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment: rozmyte plamy na sferze kierunku, reagujące na rytm
const fragmentShader = /* glsl */`
  precision highp float;
  varying vec3 vDir;

  uniform float uTime;
  uniform float uNormEnergy;
  uniform float uEnergyScale;
  uniform float uBgBassPulse;
  uniform float uBgBeatPulse;
  uniform float uBassImpact;
  uniform float uBeatPulse;

  // ── Bezszwowy 3D value noise ─────────────────────────────────────────────
  float h(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(h(i),             h(i+vec3(1,0,0)), u.x),
          mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), u.x), u.y),
      mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), u.x),
          mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), u.x), u.y), u.z);
  }

  // Miękka plama: 2 oktawy noise, wykładnik tworzy gładki gradient (niskie wartości → ciemno)
  float blob(vec3 d, float sc, vec3 drift) {
    vec3 p = d * sc + drift;
    float v = n3(p) * 0.65 + n3(p * 1.85 + 4.73) * 0.35;
    return pow(clamp(v, 0.0, 1.0), 2.5);
  }

  void main() {
    vec3 d = normalize(vDir);
    float T = uTime;

    float bassR = uBassImpact * uBgBassPulse;
    float beatR = uBeatPulse  * uBgBeatPulse;
    float kick  = 1.0 + bassR * 3.5 + beatR * 2.0; // ogólny boost rytmu

    // Prawie czarne tło
    vec3 col = vec3(0.001, 0.001, 0.003);

    // ── Plama 1: fioletowa — jedyna zawsze widoczna ───────────────────────
    float b1 = blob(d, 0.82, vec3( T*0.028,  T*0.017,  T*0.022));
    col += b1 * vec3(0.22, 0.03, 0.52) * (0.14 + kick * 0.07);

    // ── Plama 2: cyjan — tylko na rytm ───────────────────────────────────
    float b2 = blob(d, 1.18, vec3(-T*0.020,  T*0.038,  T*0.011));
    col += b2 * vec3(0.03, 0.33, 0.52) * (bassR * 1.0 + beatR * 0.6);

    // ── Plama 3: karmazyn — tylko na bass ────────────────────────────────
    float b3 = blob(d, 1.60, vec3( T*0.014, -T*0.032,  T*0.045));
    col += b3 * vec3(0.58, 0.04, 0.24) * (bassR * 1.4 + beatR * 0.5);

    // Subtelna jasność proporcjonalna do energii
    col += uNormEnergy * uEnergyScale * 0.015;

    // Ciemniejsze cienie bez gaszenia świateł: pow > 1 tłumi niskie wartości,
    // wysokie wartości (bliskie 1) są praktycznie niezmienione
    col = pow(max(col, vec3(0.0)), vec3(1.35));

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
      // Czas animacji plam
      uTime:         { value: 0 },

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
    material.uniforms.uTime.value = elapsedTime;

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
