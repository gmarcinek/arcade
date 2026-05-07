import * as THREE from 'three';
import { fullscreenVertexShader, invertShader } from '../postShaders.js';

class InvertPass {
  static CONFIG = {
    defaultIntensity:        0.0,  // 0 = off, 1 = fully inverted
    defaultContrast:         1.0,  // 1 = no change (1.3 = invert default)
    defaultBrightness:       -0.3,  // -1..1, 0 = no change
    defaultMidtonesContrast: 0.0,  // 0 = no change, >0 = more midtone punch
  };

  constructor(width, height, intensity = InvertPass.CONFIG.defaultIntensity) {
    this.width = width;
    this.height = height;

    const cfg = InvertPass.CONFIG;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:          { value: null },
        uIntensity:        { value: intensity },
        uContrast:         { value: cfg.defaultContrast },
        uBrightness:       { value: cfg.defaultBrightness },
        uMidtonesContrast: { value: cfg.defaultMidtonesContrast },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: invertShader,
    });
  }

  getMaterial() { return this.material; }

  setIntensity(v)        { this.material.uniforms.uIntensity.value = v; }
  setContrast(v)         { this.material.uniforms.uContrast.value = v; }
  setBrightness(v)       { this.material.uniforms.uBrightness.value = v; }
  setMidtonesContrast(v) { this.material.uniforms.uMidtonesContrast.value = v; }

  resize(w, h) { this.width = w; this.height = h; }
  dispose()    { this.material.dispose(); }
}

export { InvertPass };