import * as THREE from 'three';
import { fullscreenVertexShader, blackAndWhiteShader } from '../postShaders.js';

class BlackAndWhitePass {
  static CONFIG = {
    defaultIntensity: 0.0,  // 0 = full colour, 1 = full B&W
  };

  constructor(width, height, intensity = BlackAndWhitePass.CONFIG.defaultIntensity) {
    this.width = width;
    this.height = height;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:   { value: null },
        uIntensity: { value: intensity },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: blackAndWhiteShader,
    });
  }

  getMaterial() { return this.material; }
  setIntensity(v) { this.material.uniforms.uIntensity.value = v; }
  resize(w, h) { this.width = w; this.height = h; }
  dispose() { this.material.dispose(); }
}

export { BlackAndWhitePass };