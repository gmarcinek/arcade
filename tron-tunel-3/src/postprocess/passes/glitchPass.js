import * as THREE from 'three';
import { fullscreenVertexShader, glitchShader } from '../postShaders.js';
import { POSTPROCESS_CONFIG } from '../config.js';

class GlitchPass {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.enabled = true;

    const cfg = POSTPROCESS_CONFIG.glitch;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:        { value: null },
        uResolution:     { value: new THREE.Vector2(width, height) },
        uTime:           { value: 0.0 },
        uIntensity:      { value: 0.0 },
        uCAStrength:     { value: cfg.caStrength },
        uNoiseStrength:  { value: cfg.noiseStrength },
        uSliceStrength:  { value: cfg.sliceStrength },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: glitchShader,
    });

    this.quad = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.quad);
  }

  getMaterial() {
    return this.material;
  }

  update(timeSeconds) {
    this.material.uniforms.uTime.value = timeSeconds;
  }

  setIntensity(v) {
    this.material.uniforms.uIntensity.value = THREE.MathUtils.clamp(v, 0, 1);
  }

  render(renderer, inputRT, outputRT = null) {
    if (!this.enabled || !renderer || !inputRT) return;
    this.material.uniforms.tDiffuse.value = inputRT.texture;
    renderer.setRenderTarget(outputRT);
    renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.material.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export { GlitchPass };