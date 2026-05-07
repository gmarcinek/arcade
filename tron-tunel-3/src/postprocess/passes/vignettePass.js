import * as THREE from 'three';
import { fullscreenVertexShader, vignetteShader } from '../postShaders.js';

/**
 * Vignette Pass: Darkening falloff from center
 * Stylistic effect that draws attention to screen center
 */
class VignettePass {
  constructor(width, height, radius = 0.85, intensity = 0.5) {
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
