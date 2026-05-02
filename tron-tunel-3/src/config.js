// ---- Tunnel geometry constants ----
export const TUNNEL_R   = 12;
export const TUNNEL_LEN = 500;
export const LANE_COUNT = 120;
export const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT; // 0.05236 rad per lane
export const CAR_OFF    = 0.32;
export const DANGER_TIMEOUT   = 3.0;
export const BASE_SPEED_START = 32;

// ---- Physics config ----
export const CFG = {
  baseSpeed:           32,
  boostSpeed:          90,
  acceleration:        5,
  steerAcceleration:   5.5,
  maxThetaVelocity:    4.8,
  groundedFriction:    7.5,
  airFriction:         1.2,
  airControl:          0.35,
  jumpImpulse:         18.5,
  tunnelGravity:       36,
  maxRadialOffset:     10,
  boostDrain:          0.42,
  boostRegen:          0.20,
  crashRespawnSec:     1.25,
};

// ---- Ball physics material ----
export const BALL_PHYS = {
  restitution:       0.92,
  squashDuration:    1.0,
  squashAmount:      0.05,
  stretchAmount:     0.10,
  speedStretch:      0.12,
  steerLagK:         5.5,
  inertiaDecay:      1,
  surfaceDamp:       2.0,
  surfaceDampRadius: 0.5,
  bounceThreshold:   1.5,
};

// ---- Ball visual material ----
export const BALL_MAT = {
  color:           0xdddddd,
  metalness:       0.2,
  roughness:       0.01,
  reflectionRes:   256,
  envMapIntensity: 1.0,
  ringOpacity:     0.9,
  ringColor:       0x60ffee,
  transparent:     false,
  opacity:         1.0,
  depthWrite:      true,
};

// ---- Camera constants ----
export const CAM_SPRING        = 52;
export const CAM_DAMP          = 13.5;
export const CAM_MAX_VEL       = 4.4;
export const CAM_FOV_NORMAL    = 66;
export const CAM_FOV_BOOST     = 120;
export const CAM_FOV_ENTER_S   = 3.0;
export const CAM_FOV_EXIT_S    = 1.2;
export const CAM_HEIGHT_NORMAL = 4.0;
export const CAM_HEIGHT_BOOST  = 2.0;
export const CAM_DIST_NORMAL   = 13;
export const CAM_DIST_FORWARD  = 19;
export const CAM_DIST_BACK     = 9;
