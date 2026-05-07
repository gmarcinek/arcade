import * as THREE from 'three';
import { fullscreenVertexShader, passthroughShader } from './postShaders.js';

/**
 * PostChain: Minimal postprocess composition manager
 * Handles render-target ping-pong and ordered pass execution
 */
class PostChain {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertexShader,
      fragmentShader: passthroughShader,
      uniforms: {
        tDiffuse: { value: null },
      },
    });

    this.quad = new THREE.Mesh(geometry, material);

    // Orthogonal camera for fullscreen pass
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene for rendering passes
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    // Reusable blit material for fallback path
    this.blitMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertexShader,
      fragmentShader: passthroughShader,
      uniforms: {
        tDiffuse: { value: null },
      },
    });

    // Reusable fallback scene and quad
    this.blitScene = new THREE.Scene();
    this.blitQuad = new THREE.Mesh(this.quad.geometry, this.blitMaterial);
    this.blitScene.add(this.blitQuad);

    // Render targets for ping-pong
    this.rtA = this.createRenderTarget(width, height);
    this.rtB = this.createRenderTarget(width, height);

    this.passes = []; // Array of {name, passMaterial}
  }

  createRenderTarget(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
  }

  /**
   * Add a postprocess pass
   */
  addPass(name, passMaterial) {
    this.passes.push({ name, material: passMaterial });
  }

  /**
   * Remove a pass by name
   */
  removePass(name) {
    this.passes = this.passes.filter(p => p.name !== name);
  }

  /**
   * Clear all passes
   */
  clearPasses() {
    this.passes.length = 0;
  }

  /**
   * Execute postprocess chain
   * Input: sourceRT (color render target from scene)
   * Output: rendered to screen (null RT)
   */
  execute(sourceRT) {
    if (this.passes.length === 0) {
      // No passes: just blit source to screen
      this.quad.material.uniforms.tDiffuse.value = sourceRT.texture;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.orthoCamera);
      return;
    }

    let readBuffer = sourceRT;
    let writeBuffer = this.rtA;

    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i];
      const isLastPass = i === this.passes.length - 1;

      // Set input texture
      if (pass.material.uniforms.tDiffuse !== undefined) {
        pass.material.uniforms.tDiffuse.value = readBuffer.texture;
      }

      // Set output target: screen on last pass, ping-pong otherwise
      const target = isLastPass ? null : writeBuffer;
      this.renderer.setRenderTarget(target);

      // Render pass
      this.quad.material = pass.material;
      this.renderer.render(this.scene, this.orthoCamera);

      // Swap buffers for next iteration
      if (!isLastPass) {
        readBuffer = writeBuffer;
        writeBuffer = writeBuffer === this.rtA ? this.rtB : this.rtA;
      }
    }
  }

  /**
   * Blit fallback: render source RT to screen without postprocessing
   * Reuses internal quad/material/camera to avoid per-frame allocations
   */
  blitFallback(sourceRT) {
    this.blitMaterial.uniforms.tDiffuse.value = sourceRT.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.orthoCamera);
  }

  /**
   * Resize render targets
   */
  resize(width, height) {
    this.width = width;
    this.height = height;

    this.rtA.dispose();
    this.rtB.dispose();

    this.rtA = this.createRenderTarget(width, height);
    this.rtB = this.createRenderTarget(width, height);

    // Update resolution uniforms on all passes
    for (const pass of this.passes) {
      if (pass.material.uniforms.uResolution) {
        pass.material.uniforms.uResolution.value.set(width, height);
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    this.blitMaterial.dispose();
    for (const pass of this.passes) {
      if (pass.material.dispose) {
        pass.material.dispose();
      }
    }
    this.passes.length = 0;
  }
}

export { PostChain };
