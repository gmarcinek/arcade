import * as THREE from 'three';
import { fullscreenVertexShader, hueShader } from '../postShaders.js';

/**
 * Hue Pass: pełny obrót koła barw co uPeriod sekund,
 * uIntensity (0..1) miksuje między oryginałem a obróconym.
 */
class HuePass {
  static CONFIG = {
    period:               12.0,  // seconds per full hue cycle
    defaultIntensity:      1.0,  // 0 = original, 1 = full shift
    defaultSaturation:     1.0,  // 1 = no change, 0 = greyscale, >1 = oversaturated
    defaultContrast:       1.0,  // 1 = no change
    defaultBrightness:     0.0,  // -1..1, 0 = no change
    defaultMidtonesContrast: 0.0, // 0 = no change, >0 = more midtone contrast
  };

  constructor(width, height) {
    this.width = width;
    this.height = height;

    const cfg = HuePass.CONFIG;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:     { value: null },
        uTime:        { value: 0.0 },
        uPeriod:      { value: cfg.period },
        uIntensity:   { value: cfg.defaultIntensity },
        uSaturation:  { value: cfg.defaultSaturation },
        uContrast:         { value: cfg.defaultContrast },
        uBrightness:       { value: cfg.defaultBrightness },
        uMidtonesContrast: { value: cfg.defaultMidtonesContrast },
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

  setSaturation(v) {
    this.material.uniforms.uSaturation.value = v;
  }

  setContrast(v) {
    this.material.uniforms.uContrast.value = v;
  }

  setBrightness(v) {
    this.material.uniforms.uBrightness.value = v;
  }

  setMidtonesContrast(v) {
    this.material.uniforms.uMidtonesContrast.value = v;
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