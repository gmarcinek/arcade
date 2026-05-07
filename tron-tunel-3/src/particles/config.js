/**
 * Central particle-system defaults used by HMParticleSystem.
 */
export const PARTICLES_CONFIG = {
  qualityTiers: {
    low: 300,
    med: 500,
    high: 1200, //
  },
  particleLifetime: {
    default: 1.5,
  },
  sizeRange: {
    min: 1.05,
    max: 3.14,
  },
  emitter: {
    spawnRadius: 1.2,
    backOffset: 1.0, // how far behind the player to spawn particles
    cameraFallbackOffset: 2.4,
    cameraFallbackJitter: 0.45,
    speedMin: 25,
    speedMax: 95,
    ratePerSecond: {
      low: 16,
      med: 30,
      high: 52,
    },
  },
  seedRangeMax: 1000,
  fogDefaults: {
    color: 0xffffff,
    near: 28,
    far: 220,
    densityFallback: 0.02,
  },
};
