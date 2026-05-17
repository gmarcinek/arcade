import * as THREE from 'three';
import { fullscreenVertexShader, grainShader } from '../postShaders.js';

class GrainPass {
  static CONFIG = {
    // Cold ball: no noise and no grain.
    defaultNoiseAmount: 0.0,
    defaultGrainAmount: 0.0,
    // Max ball overheat.
    maxNoiseAmount: 0.4,
    maxGrainAmount: 0.42,
    maxGlitchAmount: 1.0,
  };

  constructor(width, height) {
    this.width = width;
    this.height = height;

    const cfg = GrainPass.CONFIG;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uNoiseAmount: { value: cfg.defaultNoiseAmount },
        uGrainAmount: { value: cfg.defaultGrainAmount },
        uGlitchAmount: { value: 0.0 },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: grainShader,
    });
  }

  getMaterial() { return this.material; }

  update(timeSeconds) {
    this.material.uniforms.uTime.value = timeSeconds;
  }

  setNoiseAmount(v) {
    this.material.uniforms.uNoiseAmount.value = Math.max(0, v);
  }

  setGrainAmount(v) {
    this.material.uniforms.uGrainAmount.value = Math.max(0, v);
  }

  setGlitchAmount(v) {
    this.material.uniforms.uGlitchAmount.value = Math.max(0, Math.min(1, v));
  }

  setFromHeat(heat01) {
    const h = Math.max(0, Math.min(1, heat01));
    this.setNoiseAmount(GrainPass.CONFIG.maxNoiseAmount * h);
    this.setGrainAmount(GrainPass.CONFIG.maxGrainAmount * h);
    // Channel split ramps together with noise/grain from the start.
    this.setGlitchAmount(GrainPass.CONFIG.maxGlitchAmount * h);
  }

  setNoiseOffTrack(isOffTrack) {
    const noiseAmount = isOffTrack ? GrainPass.CONFIG.maxNoiseAmount : GrainPass.CONFIG.defaultNoiseAmount;
    this.setNoiseAmount(noiseAmount);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.material.uniforms.uResolution.value.set(w, h);
  }

  dispose() {
    this.material.dispose();
  }
}

export { GrainPass };
