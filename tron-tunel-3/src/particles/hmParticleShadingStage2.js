/**
 * Stage 2: Depth-aware particle shading with fog and shadow ideas
 * This module provides enhanced shading logic that can replace the basic
 * Stage 1 additive blending with depth reconstruction and advanced lighting.
 */

/**
 * Adapt particle material to use Stage 2 depth-aware shading
 * This is called when transitioning from Stage 1 to Stage 2
 */
export function enableStage2Shading(particleSystem) {
  if (!particleSystem || !particleSystem.material) {
    console.warn('enableStage2Shading: particleSystem or material not found');
    return;
  }

  // Enable Stage 2 flag in material
  particleSystem.material.uniforms.stage2Enabled.value = 1.0;
}

/**
 * Disable Stage 2 shading and fall back to Stage 1
 */
export function disableStage2Shading(particleSystem) {
  if (!particleSystem || !particleSystem.material) {
    console.warn('disableStage2Shading: particleSystem or material not found');
    return;
  }

  particleSystem.material.uniforms.stage2Enabled.value = 0.0;
}

/**
 * Update Stage 2 uniforms based on scene state
 */
export function updateStage2Uniforms(particleSystem, {
  sceneColorRT = null,
  depthTexture = null,
  fogColor = null,
  fogNear = 28,
  fogFar = 220,
  camera = null,
  lights = []
}) {
  if (!particleSystem || !particleSystem.uniforms) {
    console.warn('updateStage2Uniforms: particleSystem uniforms not found');
    return;
  }

  const uniforms = particleSystem.uniforms;

  // Set depth texture for depth-aware occlusion
  if (depthTexture) {
    uniforms.depthTexture.value = depthTexture;
  }

  // Set fog parameters
  if (fogColor) {
    uniforms.fogColor.value.copy(fogColor);
  }
  uniforms.fogNear.value = fogNear;
  uniforms.fogFar.value = fogFar;

  // Update camera matrices for depth reconstruction
  if (camera) {
    uniforms.cameraPosition.value.copy(camera.position);
    uniforms.cameraMatrix.value.copy(camera.matrixWorld);
    uniforms.cameraMatrixInverse.value.copy(camera.matrixWorldInverse);
    uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);

    // Compute projection matrix inverse using modern API
    uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrix).invert();
  }

  // Set light position (first light for now)
  if (lights.length > 0) {
    const light = lights[0];
    if (light.position) {
      uniforms.lightPosition.value.copy(light.position);
    }
  }
}

/**
 * Simplified shadow sampling idea for Stage 2
 * (Not fully implemented without proper shadow map setup)
 * Can be expanded if renderer.shadowMap is enabled
 */
export function contributeShadowTerm(shadowMap, worldPos, lightPos) {
  // Placeholder for shadow map sampling
  // In a full implementation, this would:
  // 1. Transform worldPos to light space
  // 2. Sample shadow map
  // 3. Return shadow term (0 = in shadow, 1 = lit)
  
  // For now, return simple distance-based approximation
  const dist = worldPos.distanceTo(lightPos);
  return 1.0 - Math.min(1.0, Math.max(0.0, dist / 50.0) * 0.5);
}

/**
 * Helper: Set up render-to-texture pipeline for Stage 2
 * (Main.js will handle this, but this documents the expected pattern)
 */
export function setupRenderTargetPipeline(renderer, width, height) {
  // Create color render target with attached depth texture
  const sceneColorRT = new (require('three')).WebGLRenderTarget(width, height, {
    format: require('three').RGBAFormat,
    type: require('three').UnsignedByteType,
    minFilter: require('three').LinearFilter,
    magFilter: require('three').LinearFilter,
    depthTexture: new (require('three')).DepthTexture(
      width, height,
      require('three').UnsignedIntType
    ),
  });

  return {
    sceneColorRT,
    depthTexture: sceneColorRT.depthTexture,
  };
}

export default {
  enableStage2Shading,
  disableStage2Shading,
  updateStage2Uniforms,
  contributeShadowTerm,
  setupRenderTargetPipeline,
};
