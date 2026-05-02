import { BALL_PHYS, CFG } from './config.js';

export const state = {
  // --- physics flags ---
  physicsMode:    true,
  physicsForce:   0,
  restitutionCurrent: BALL_PHYS.restitution,
  materialDamp:   1.0,   // 1 = full deform, 0 = pure rolling (lerped by S/↓)
  jumpCooldown:   0,     // seconds until next jump allowed
  landingEvaluated: false,

  // --- position / movement ---
  carTheta:        0,
  thetaVelocity:   0,
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

  // --- visuals ---
  ballSpinAngle: 0,
  squashTimer:   0,
  frameCount:    0,

  // --- obstacles ---
  obstacles: [],
};
