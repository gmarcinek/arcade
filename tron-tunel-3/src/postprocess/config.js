/**
 * Central postprocess defaults.
 * Keep values conservative to avoid over-blurring the scene.
 */
export const POSTPROCESS_CONFIG = {
  dof: {
    defaultFocalDistance: 201.5,
    defaultNearAmount: 0.125,
    defaultFarAmount: 0.04,
    defaultFocalRange: 198.5,
    defaultNear: 0.1, // near plane for DOF calculations; objects closer than this will be fully blurred
    defaultFar: 500.0,
    maxBlurRadius: 8.0,
  },
  vignette: {
    defaultRadius: 0.85,
    defaultIntensity: 0.5,
  },
  toggles: {
    postEnabled: true,
    enableDOF: true,
    enableFXAA: true,
    enableVignette: true,
    enableHue: true,
  },
  hue: {
      period: 12.0,          // sekundy na pełny obrót
      defaultIntensity: 1.0, // 0..1 miksuje między oryginałem a obróconym
  },
};
