import * as THREE from 'three';
import { fullscreenVertexShader, hueShader } from '../postShaders.js';
import { POSTPROCESS_CONFIG } from '../config.js';

/**
 * Hue Pass: pełny obrót koła barw co uPeriod sekund,
 * uIntensity (0..1) miksuje między oryginałem a obróconym.
 */
class HuePass {
  constructor(width, height) {
    this.width = width;
    this.height = height;

    const cfg = POSTPROCESS_CONFIG.hue;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:   { value: null },
        uTime:      { value: 0.0 },
        uPeriod:    { value: cfg.period },
        uIntensity: { value: cfg.defaultIntensity },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: hueShader,
    });
  }

  getMaterial() {
    return this.material;
  }

  /** Wywołaj co klatkę */
  update(timeSeconds) {
    this.material.uniforms.uTime.value = timeSeconds;
  }

  setIntensity(v) {
    this.material.uniforms.uIntensity.value = v;
  }

  setPeriod(seconds) {
    this.material.uniforms.uPeriod.value = seconds;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  dispose() {
    this.material.dispose();
  }
}

export { HuePass };