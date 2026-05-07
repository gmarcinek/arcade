import * as THREE from 'three';
import { fullscreenVertexShader, fxaaShader } from '../postShaders.js';

/**
 * FXAA Pass: Fast Approximate Anti-Aliasing
 * Reduces aliasing artifacts, especially useful after blur passes
 */
class FXAAPass {
  static CONFIG = {
    // FXAA has no tunable uniforms beyond resolution; slot kept for future params
  };

  constructor(width, height) {
    this.width = width;
    this.height = height;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: fxaaShader,
    });
  }

  /**
   * Get the pass material (for adding to PostChain)
   */
  getMaterial() {
    return this.material;
  }

  /**
   * Resize handler
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.material.uniforms.uResolution.value.set(width, height);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.material.dispose();
  }
}

export { FXAAPass };
