import { BALL_PHYS, CFG } from './config.js';
import { POSTPROCESS_CONFIG } from './postprocess/config.js';

export const state = {
  // --- physics flags ---
  physicsMode:    true,
  physicsForce:   0,
  restitutionCurrent: BALL_PHYS.restitution,
  materialDamp:   1.0,   // 1 = full deform, 0 = pure rolling (lerped by S/↓)
  jumpCooldown:   0,     // seconds until next jump allowed
  jumpChargeTime: 0,     // seconds Space has been held while charging
  landingEvaluated: false,

  // --- position / movement ---
  carTheta:        0,
  thetaVelocity:   0,
  ballOmega:       0,   // ball's own angular velocity (rad/s) — drives rolling
  radialOffset:    0,
  radialVelocity:  0,
  grounded:        true,
  crashed:         false,
  crashTimer:      0,
  tumbleRollAngle:     0,
  tumblePitchAngle:    0,
  tumbleRollVelocity:  0,
  tumblePitchVelocity: 0,
  carZ:            0,
  speed:           CFG.baseSpeed,
  timeElapsed:     0,
  boost:           1,
  boostActive:     false,
  boostArmed:      false,  // true only when fuel >= BOOST_MIN_FUEL and heat is low

  // --- game ---
  score:           0,
  timeLeft:        60,
  gameRunning:     false,
  flashAlpha:      0,
  totalDistance:   0,
  dangerTimer:     0,

  // --- camera ---
  cameraTheta:             0,
  cameraThetaVelocity:     0,
  cameraFovCurrent:        66,
  cameraBackDistanceCurrent: 9,
  cameraHeightCurrent:     4.0,

  // --- audio tunnel ---
  audioTwistOffset: 0,  // accumulated cross-section roll driven by twistSrc (rad); synced from InfiniteMesh

  // --- visuals ---
  ballSpinAngle:   0,
  ballHeatScale:   1.0,
  squashTimer:   0,
  frameCount:    0,
  bounceImpact:  0,   // set by physics on hard bounce; read+cleared by ball visuals
  edgeProximity:   0,   // 0 = safe, 1 = on edge (open surface only)
  edgeHeat:        0,   // accumulated heat 0..1 from time spent near edge
  outOfBounds:     false,
  outOfBoundsTimer: 0,
  respawning:      false,
  respawnTimer:    0,
  showForces:    false,  // debug: toggle with F key

  // --- obstacles ---
  obstacles: [],

  // --- procedural player (M3) ---
  activeSurfaceId: null,
  s:               0,
  u:               0,
  uVelocity:       0,
  sVelocity:       0,

  // --- particles (Stage 1 & 2) ---
  particlesHalfResBuffer: false,      // Optional half-res for intermediate stages

  // --- postprocessing (Stage 3) ---
  postEnabled:            POSTPROCESS_CONFIG.toggles.postEnabled,
  enableDOF:              POSTPROCESS_CONFIG.toggles.enableDOF,
  dofHalfRes:             true,       // Use half-resolution for DOF blur
  dofFocalDistance:       POSTPROCESS_CONFIG.dof.defaultFocalDistance,
  dofNearAmount:          POSTPROCESS_CONFIG.dof.defaultNearAmount,
  dofFarAmount:           POSTPROCESS_CONFIG.dof.defaultFarAmount,
  dofFocalRange:          POSTPROCESS_CONFIG.dof.defaultFocalRange,
  dofMaxRadius:           POSTPROCESS_CONFIG.dof.maxBlurRadius,
  enableFXAA:             POSTPROCESS_CONFIG.toggles.enableFXAA,
  enableVignette:         POSTPROCESS_CONFIG.toggles.enableVignette,
  vignetteRadius:         POSTPROCESS_CONFIG.vignette.defaultRadius,
  vignetteIntensity:      POSTPROCESS_CONFIG.vignette.defaultIntensity,
};
