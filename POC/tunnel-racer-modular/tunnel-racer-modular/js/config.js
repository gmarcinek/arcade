export const CAR_GEOMETRY_CENTER_HEIGHT = 0.65;

export const CONFIG = {
  tunnelRadius: 12,

  baseSpeed: 64,
  boostSpeed: 108,
  acceleration: 8,

  steerAcceleration: 9.0,
  maxThetaVelocity: 4.8,
  groundedFriction: 7.5,
  airFriction: 1.2,
  airControl: 0.35,

  jumpImpulse: 18.5,
  tunnelGravity: 36,
  maxRadialOffset: 10,

  boostDrain: 0.55,
  boostRegen: 0.28,
  forwardSpeedBonus: 14,
  brakeSpeedPenalty: 38,

  kickflipDuration: 0.72,

  ceilingTransferDuration: 0.86,
  doubleJumpImpulse: 15,
  doubleJumpMinOffset: 2.4,
  doubleJumpWindowMs: 300,
  transferDeadpointWindowMs: 500,
  transferDeadpointMinOffset: 5.4,

  cleanLandingDegrees: 15,
  hardLandingDegrees: 20,
  crashRespawnSeconds: 1.25,
};

export const CAMERA_HEIGHT = {
  normal: 4.0,
  boost: 2.0,
  enterSeconds: 3.0,
  exitSeconds: 1.2,
};

export const CAMERA_FOV = {
  normal: 66,
  boost: 120,
  enterSeconds: 3.0,
  exitSeconds: 1.2,
};

export const CAMERA_DISTANCE = {
  normal: 15.75,
  forward: 19.25,
  back: 10.0,
  lerpSpeed: 3.2,
};

export const CAMERA_PHYSICS = {
  thetaSpring: 52,
  thetaDamping: 13.5,
  maxThetaVelocity: 4.4,
  transferChaseDelayMs: 1200,
};
