import * as THREE from 'three';
import { particlesVertexShader, particlesFragmentShader } from './hmParticlesShaders.js';
import { PARTICLES_CONFIG } from './config.js';

/**
 * Curl-flow GPU particle system for tron-tunel-3.
 * Stage 1: Stateless curl-flow particles with additive blending.
 * Stage 2: Depth-aware with fog and camera uniforms.
 */

class HMParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    // Particle pool: {x, y, z, seed, spawnTime, side, size, lifetime}
    this.particles = [];
    this.maxParticles = PARTICLES_CONFIG.qualityTiers.med; // Updated based on quality tier
    this.particleLifetime = PARTICLES_CONFIG.particleLifetime.default; // seconds
    this.emitAccumulator = 0;

    this.emitterState = {
      active: false,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, 1),
      intensity: 1,
    };

    this._tmpForward = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3();
    this._tmpSpawnPos = new THREE.Vector3();
    this._tmpAxis = new THREE.Vector3();

    // Geometry and material
    this.geometry = null;
    this.material = null;
    this.points = null;

    // Uniforms for Stage 2 (depth/camera/light)
    this.uniforms = {
      time: { value: 0 },
      elapsedTime: { value: 0 },
      particleLifetime: { value: this.particleLifetime },
      cameraMatrix: { value: new THREE.Matrix4() },
      cameraMatrixInverse: { value: new THREE.Matrix4() },
      cameraProjectionMatrix: { value: new THREE.Matrix4() },
      cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
      fogColor: { value: new THREE.Color(PARTICLES_CONFIG.fogDefaults.color) },
      fogDensity: { value: PARTICLES_CONFIG.fogDefaults.densityFallback },
      fogNear: { value: PARTICLES_CONFIG.fogDefaults.near },
      fogFar: { value: PARTICLES_CONFIG.fogDefaults.far },
      cameraPosition: { value: new THREE.Vector3() },
      lightPosition: { value: new THREE.Vector3(0, 0, 0) },
      depthTexture: { value: null }, // Stage 2 only
      sceneColorRT: { value: null }, // Stage 2 only
      stage2Enabled: { value: false }, // Toggle between Stage 1 and Stage 2 shading
    };

    this.init();
  }

  init() {
    // Create particle geometry with attributes
    const geometry = new THREE.BufferGeometry();

    // Initial particle data
    const positionArray = new Float32Array(this.maxParticles * 3);
    const seedArray = new Float32Array(this.maxParticles);
    const spawnTimeArray = new Float32Array(this.maxParticles);
    const sideArray = new Float32Array(this.maxParticles);
    const sizeArray = new Float32Array(this.maxParticles);

    for (let i = 0; i < this.maxParticles; i++) {
      positionArray[i * 3] = 0;
      positionArray[i * 3 + 1] = 0;
      positionArray[i * 3 + 2] = 0;
      seedArray[i] = Math.random() * PARTICLES_CONFIG.seedRangeMax;
      spawnTimeArray[i] = -1000;
      sideArray[i] = Math.random() > 0.5 ? 1 : -1;
      sizeArray[i] = PARTICLES_CONFIG.sizeRange.min + Math.random() * (PARTICLES_CONFIG.sizeRange.max - PARTICLES_CONFIG.sizeRange.min);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seedArray, 1));
    geometry.setAttribute('spawnTime', new THREE.BufferAttribute(spawnTimeArray, 1));
    geometry.setAttribute('side', new THREE.BufferAttribute(sideArray, 1));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1));

    this.geometry = geometry;

    // Create material
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: particlesVertexShader,
      fragmentShader: particlesFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });

    this.material = material;

    // Create points mesh
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.points = points;
    this.scene.add(points);
  }

  /**
   * Emit particles from a position with initial velocity
   */
  emit(
    position,
    velocity,
    count = PARTICLES_CONFIG.emitter.ratePerSecond.med,
    lifetime = PARTICLES_CONFIG.particleLifetime.default
  ) {
    if (!this.enabled) return;

    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const particle = {
        x: position.x,
        y: position.y,
        z: position.z,
        seed: Math.random() * PARTICLES_CONFIG.seedRangeMax,
        spawnTime: this.uniforms.time.value,
        side: Math.random() > 0.5 ? 1 : -1,
        size: PARTICLES_CONFIG.sizeRange.min + Math.random() * (PARTICLES_CONFIG.sizeRange.max - PARTICLES_CONFIG.sizeRange.min),
        lifetime: lifetime,
      };
      this.particles.push(particle);
    }

    this.updateAttributeBuffer();
  }

  setEmitter(position, direction, intensity = 1) {
    this.emitterState.active = true;
    this.emitterState.position.copy(position);

    if (direction && direction.lengthSq() > 1e-6) {
      this.emitterState.direction.copy(direction).normalize();
    } else {
      this.emitterState.direction.set(0, 0, 1);
    }

    this.emitterState.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  clearEmitter() {
    this.emitterState.active = false;
    this.emitterState.intensity = 0;
  }

  emitFromEmitter(position, direction, count, lifetime) {
    const radius = PARTICLES_CONFIG.emitter.spawnRadius;
    const backOffset = PARTICLES_CONFIG.emitter.backOffset;

    this._tmpForward.copy(direction).normalize();
    if (Math.abs(this._tmpForward.y) < 0.95) {
      this._tmpAxis.set(0, 1, 0);
    } else {
      this._tmpAxis.set(1, 0, 0);
    }

    this._tmpRight.crossVectors(this._tmpForward, this._tmpAxis).normalize();
    this._tmpUp.crossVectors(this._tmpRight, this._tmpForward).normalize();

    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radial = Math.sqrt(Math.random()) * radius;

      this._tmpSpawnPos.copy(position)
        .addScaledVector(this._tmpRight, Math.cos(angle) * radial)
        .addScaledVector(this._tmpUp, Math.sin(angle) * radial)
        .addScaledVector(this._tmpForward, -backOffset);

      this.particles.push({
        x: this._tmpSpawnPos.x,
        y: this._tmpSpawnPos.y,
        z: this._tmpSpawnPos.z,
        seed: Math.random() * PARTICLES_CONFIG.seedRangeMax,
        spawnTime: this.uniforms.time.value,
        side: Math.random() > 0.5 ? 1 : -1,
        size: PARTICLES_CONFIG.sizeRange.min + Math.random() * (PARTICLES_CONFIG.sizeRange.max - PARTICLES_CONFIG.sizeRange.min),
        lifetime,
      });
    }

    this.updateAttributeBuffer();
  }

  /**
   * Update particle positions and lifetimes
   */
  update(dt, elapsedTime, camera) {
    this.uniforms.time.value = elapsedTime;
    this.uniforms.elapsedTime.value = elapsedTime;
    this.uniforms.particleLifetime.value = this.particleLifetime;

    // Update camera matrices for Stage 2 depth reconstruction
    if (camera) {
      this.uniforms.cameraPosition.value.copy(camera.position);
      this.uniforms.cameraMatrix.value.copy(camera.matrixWorld);
      this.uniforms.cameraMatrixInverse.value.copy(camera.matrixWorldInverse);
      this.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      this.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrix).invert();
    }

    if (this.enabled) {
      let emitPos = null;
      let emitDir = null;
      let intensity = 0;

      if (this.emitterState.active) {
        emitPos = this.emitterState.position;
        emitDir = this.emitterState.direction;
        intensity = this.emitterState.intensity;
      } else if (camera) {
        const fallbackDir = camera.getWorldDirection(this._tmpForward);
        this._tmpSpawnPos.copy(camera.position)
          .addScaledVector(fallbackDir, PARTICLES_CONFIG.emitter.cameraFallbackOffset)
          .add(new THREE.Vector3(
            (Math.random() - 0.5) * PARTICLES_CONFIG.emitter.cameraFallbackJitter,
            (Math.random() - 0.5) * PARTICLES_CONFIG.emitter.cameraFallbackJitter,
            (Math.random() - 0.5) * PARTICLES_CONFIG.emitter.cameraFallbackJitter
          ));

        emitPos = this._tmpSpawnPos;
        emitDir = fallbackDir;
        intensity = 0.4;
      }

      if (emitPos && emitDir && intensity > 0) {
        const tier = this._currentQualityTier || 'med';
        const ratePerSecond = PARTICLES_CONFIG.emitter.ratePerSecond[tier] || PARTICLES_CONFIG.emitter.ratePerSecond.med;
        this.emitAccumulator += dt * ratePerSecond * intensity;

        const spawnCount = Math.min(
          Math.floor(this.emitAccumulator),
          Math.max(0, this.maxParticles - this.particles.length)
        );

        if (spawnCount > 0) {
          this.emitAccumulator -= spawnCount;
          this.emitFromEmitter(emitPos, emitDir, spawnCount, this.particleLifetime);
        }
      }
    }

    // Age particles and remove dead ones
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = elapsedTime - p.spawnTime;
      if (age > p.lifetime) {
        this.particles.splice(i, 1);
      }
    }

    this.updateAttributeBuffer();
  }

  /**
   * Update GPU buffer with particle data
   */
  updateAttributeBuffer() {
    const posAttr = this.geometry.getAttribute('position');
    const spawnAttr = this.geometry.getAttribute('spawnTime');
    const seedAttr = this.geometry.getAttribute('seed');
    const sideAttr = this.geometry.getAttribute('side');
    const sizeAttr = this.geometry.getAttribute('size');

    const posArray = posAttr.array;
    const spawnArray = spawnAttr.array;
    const seedArray = seedAttr.array;
    const sideArray = sideAttr.array;
    const sizeArray = sizeAttr.array;

    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        posArray[i * 3] = p.x;
        posArray[i * 3 + 1] = p.y;
        posArray[i * 3 + 2] = p.z;
        spawnArray[i] = p.spawnTime;
        seedArray[i] = p.seed;
        sideArray[i] = p.side;
        sizeArray[i] = p.size;
      } else {
        posArray[i * 3] = 0;
        posArray[i * 3 + 1] = 0;
        posArray[i * 3 + 2] = 0;
        spawnArray[i] = -1000;
        seedArray[i] = Math.random() * PARTICLES_CONFIG.seedRangeMax;
        sideArray[i] = Math.random() > 0.5 ? 1 : -1;
        sizeArray[i] = PARTICLES_CONFIG.sizeRange.min + Math.random() * (PARTICLES_CONFIG.sizeRange.max - PARTICLES_CONFIG.sizeRange.min);
      }
    }

    posAttr.needsUpdate = true;
    spawnAttr.needsUpdate = true;
  }

  /**
   * Set fog uniforms from scene
   */
  setFogFromScene(fog) {
    if (fog) {
      this.uniforms.fogColor.value.copy(fog.color);
      this.uniforms.fogNear.value = fog.near;
      this.uniforms.fogFar.value = fog.far;
      this.uniforms.fogDensity.value = (fog.far - fog.near) > 0
        ? 1.0 / (fog.far - fog.near)
        : PARTICLES_CONFIG.fogDefaults.densityFallback;
    }
  }

  /**
   * Set light position for shadow ideas
   */
  setLightPosition(position) {
    this.uniforms.lightPosition.value.copy(position);
  }

  /**
   * Set render target for depth texture (Stage 2)
   */
  setDepthTexture(depthTexture) {
    this.uniforms.depthTexture.value = depthTexture;
  }

  /**
   * Enable Stage 2 depth-aware shading
   */
  enableStage2(enabled = true) {
    this.uniforms.stage2Enabled.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Resize handler for any resolution-dependent uniforms
   */
  resize(width, height) {
    // No specific resize needed for current implementation
    // but hook is available for future DPR/resolution uniforms
  }

  /**
   * Set quality tier (low/med/high) - affects particle count
   */
  setQualityTier(tier) {
    this._currentQualityTier = tier;
    this.maxParticles = PARTICLES_CONFIG.qualityTiers[tier] || PARTICLES_CONFIG.qualityTiers.med;
    this.recreateGeometry();
  }

  /**
   * Recreate geometry with new particle count
   */
  recreateGeometry() {
    if (this.points) this.scene.remove(this.points);
    if (this.geometry) this.geometry.dispose();
    this.particles = this.particles.slice(0, this.maxParticles);

    this.init();
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.points) this.scene.remove(this.points);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    this.particles.length = 0;
  }
}

export { HMParticleSystem };
