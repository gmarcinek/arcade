import * as THREE from 'three';
import { fullscreenVertexShader, dofHorizontalShader, dofVerticalShader } from '../postShaders.js';
import { POSTPROCESS_CONFIG } from '../config.js';

/**
 * DOF Pass: Depth-of-Field separable blur
 * Uses horizontal and vertical passes for efficient gaussian blur
 */
class DOFPass {
  constructor(width, height, depthTexture) {
    this.width = width;
    this.height = height;
    this.depthTexture = depthTexture;

    // Intermediate target for horizontal blur result
    this.rtIntermediate = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Horizontal pass material
    this.horizontalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uDelta: { value: new THREE.Vector2(1.0, 0.0) },
        uDofDistance: { value: POSTPROCESS_CONFIG.dof.defaultFocalDistance },
        uDofNearAmount: { value: POSTPROCESS_CONFIG.dof.defaultNearAmount },
        uDofFarAmount: { value: POSTPROCESS_CONFIG.dof.defaultFarAmount },
        uDofFocalRange: { value: POSTPROCESS_CONFIG.dof.defaultFocalRange },
        uDofMaxRadius: { value: POSTPROCESS_CONFIG.dof.maxBlurRadius },
        uNear: { value: POSTPROCESS_CONFIG.dof.defaultNear },
        uFar: { value: POSTPROCESS_CONFIG.dof.defaultFar },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: dofHorizontalShader,
    });

    // Vertical pass material
    this.verticalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uDelta: { value: new THREE.Vector2(0.0, 1.0) },
        uDofDistance: { value: POSTPROCESS_CONFIG.dof.defaultFocalDistance },
        uDofNearAmount: { value: POSTPROCESS_CONFIG.dof.defaultNearAmount },
        uDofFarAmount: { value: POSTPROCESS_CONFIG.dof.defaultFarAmount },
        uDofFocalRange: { value: POSTPROCESS_CONFIG.dof.defaultFocalRange },
        uDofMaxRadius: { value: POSTPROCESS_CONFIG.dof.maxBlurRadius },
        uNear: { value: POSTPROCESS_CONFIG.dof.defaultNear },
        uFar: { value: POSTPROCESS_CONFIG.dof.defaultFar },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: dofVerticalShader,
    });
  }

  /**
   * Get the horizontal pass material (for adding to PostChain)
   */
  getHorizontalMaterial() {
    return this.horizontalMaterial;
  }

  /**
   * Get the vertical pass material (for adding to PostChain)
   */
  getVerticalMaterial() {
    return this.verticalMaterial;
  }

  /**
   * Update DOF parameters
   */
  setDOFParameters(
    focalDistance,
    nearAmount,
    farAmount,
    focalRange,
    maxRadius,
    near = POSTPROCESS_CONFIG.dof.defaultNear,
    far = POSTPROCESS_CONFIG.dof.defaultFar
  ) {
    this.horizontalMaterial.uniforms.uDofDistance.value = focalDistance;
    this.horizontalMaterial.uniforms.uDofNearAmount.value = nearAmount;
    this.horizontalMaterial.uniforms.uDofFarAmount.value = farAmount;
    this.horizontalMaterial.uniforms.uDofFocalRange.value = focalRange;
    this.horizontalMaterial.uniforms.uDofMaxRadius.value = maxRadius;
    this.horizontalMaterial.uniforms.uNear.value = near;
    this.horizontalMaterial.uniforms.uFar.value = far;

    this.verticalMaterial.uniforms.uDofDistance.value = focalDistance;
    this.verticalMaterial.uniforms.uDofNearAmount.value = nearAmount;
    this.verticalMaterial.uniforms.uDofFarAmount.value = farAmount;
    this.verticalMaterial.uniforms.uDofFocalRange.value = focalRange;
    this.verticalMaterial.uniforms.uDofMaxRadius.value = maxRadius;
    this.verticalMaterial.uniforms.uNear.value = near;
    this.verticalMaterial.uniforms.uFar.value = far;
  }

  /**
   * Resize internal buffers
   */
  resize(width, height) {
    this.width = width;
    this.height = height;

    this.rtIntermediate.dispose();
    this.rtIntermediate = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.horizontalMaterial.uniforms.uResolution.value.set(width, height);
    this.verticalMaterial.uniforms.uResolution.value.set(width, height);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.rtIntermediate.dispose();
    this.horizontalMaterial.dispose();
    this.verticalMaterial.dispose();
  }
}

export { DOFPass };
