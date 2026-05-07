import * as THREE from 'three';
import { fullscreenVertexShader, vignetteShader } from '../postShaders.js';

class VignettePass {
  static CONFIG = {
    defaultRadius:    0.85,  // 0..1, larger = smaller vignette ring
    defaultIntensity: 0.5,   // 0 = none, 1 = fully dark edges
  };

  constructor(
    width, height,
    radius    = VignettePass.CONFIG.defaultRadius,
    intensity = VignettePass.CONFIG.defaultIntensity
  ) {
    this.width = width;
    this.height = height;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uVignetteRadius: { value: radius },
        uVignetteIntensity: { value: intensity },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: vignetteShader,
    });
  }

  /**
   * Get the pass material (for adding to PostChain)
   */
  getMaterial() {
    return this.material;
  }

  /**
   * Set vignette parameters
   */
  setVignetteParameters(radius, intensity) {
    this.material.uniforms.uVignetteRadius.value = radius;
    this.material.uniforms.uVignetteIntensity.value = intensity;
  }

  /**
   * Resize handler (no internal buffers needed)
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.material.dispose();
  }
}

export { VignettePass };
