// ---- Tunnel geometry constants ----
export const TUNNEL_R   = 12;
export const TUNNEL_LEN = 1200;
export const LANE_COUNT = 120;
export const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT; // 0.05236 rad per lane
export const CAR_OFF    = 0.32; //
export const DANGER_TIMEOUT   = 145.0;
export const BASE_SPEED_START = 32;

// ---- Camera constants ----
export const CAM_SPRING        = 52; // spring stiffness (N/m) — higher = tighter spring, more rubber-banding; lower = looser spring, more floaty feel
export const CAM_DAMP          = 13.5; // critically damped at ~13.5, lower for more floaty feel
export const CAM_MAX_VEL       = 4.4; // max camera velocity (prevents extreme rubber-banding when player clips into wall)
export const CAM_FOV_NORMAL    = 60;
export const CAM_FOV_BOOST     = 110;
export const CAM_FOV_ENTER_S   = 3.0;
export const CAM_FOV_EXIT_S    = 3.0;
export const CAM_HEIGHT_NORMAL = 4.0;
export const CAM_HEIGHT_BOOST  = 2.0;
export const CAM_DIST_NORMAL   = 6;
export const CAM_DIST_FORWARD  = 14;
export const CAM_DIST_BACK     = 4;

// ---- Physics config ----
export const CFG = {
  steerAcceleration:   1.5,
  maxThetaVelocity:    3,

  baseSpeed:           20,
  forwardSpeed:        70,
  boostSpeed:          95,
  acceleration:        0.2,
  speedForce:          10,
  speedFriction:       0.5,
  groundedFriction:    0.01,
  airFriction:         0.01,
  airControl:          1,
  jumpImpulse:         15.5,
  tunnelGravity:       32,// gravity toward tube floor (rad/s²)
  tunnelAngularGravity: 0.0,  // rad/s² — pendulum restoring force toward tube floor (theta=0); tune per difficulty level
  maxRadialOffset:     10, // max distance from tube center (for camera floor avoidance)
  boostDrain:          0.32, // per second
  boostRegen:          0.60, // per second
};

// ---- Ball physics material ----
export const BALL_PHYS = {
  restitution:       0.7,
  inertiaDecay:      0.08,

  squashDuration:    0.05,
  squashAmount:      0.15,
  stretchAmount:     0.15,
  speedStretch:      0.0,

  surfaceDamp:       1,
  surfaceDampRadius: 0.2,
  bounceThreshold:   5,
};

// ---- Ball visual material ----
export const BALL_MAT = {
  color:           0x000000,
  metalness:       0.9,
  roughness:       0,
  reflectionRes:   128,
  envMapIntensity: 4.0,
  ringOpacity:     1.0,
  ringColor:       0x60ffee,
  transparent:     false,
  opacity:         1.0,
  depthWrite:      true,
};

// ---- Tunnel shader FX ----
export const TUNNEL_FX = {
  lavaStrength: 0.52,

  reflectionStrength: 0,
  reflectionZOffset: 1,

  reflectionLiftFadeStart: 0.35,
  reflectionLiftFadeEnd: 5.2,

  reflectionDarken: 0.18,
  reflectionTint: 1.70,
  reflectionHighlight: 120.55,
};

// ---- Procedural track config ----
export const PROC_CFG = {
  // Segment geometry
  SEGMENT_LENGTH_MIN:    290,
  SEGMENT_LENGTH_MAX:    310,
  MAX_TURN_XZ:           0.524,
  MAX_TURN_Y:            0.10,
  CONTROL_POINTS_MIN:    1,
  CONTROL_POINTS_MAX:    1,

  // Safe track
  SAFE_TRACK_SAMPLES:    200,

  // Chunk streaming
  LOOKAHEAD_SEGMENTS:    2,
  TRAIL_SEGMENTS:        1,

  // Speed (proc-specific)
  SPEED_BASE:            60,
  SPEED_MAX:             120,
  SPEED_BOOST:           160,
  STEER_ACCELERATION:    5,
  MAX_U_VELOCITY:        9,

  KAPPA_INTERVAL: 300,
  KAPPA_MIN: -0.7,
  KAPPA_MAX: +1.5,

  ARC_INTERVAL: 450,
  ARC_MIN: 0.2,
  ARC_MAX: 1.0,
  TWIST_INTERVAL: 400,

  // Camera look-ahead
  CAM_LOOKAHEAD_OFFSETS: [8, 18, 30],
  CAM_LOOKAHEAD_WEIGHTS: [0.40, 0.35, 0.25],
  CAM_LOOKAHEAD_TAU:     0.25,

  // Camera position
  CAM_HEIGHT:        3.5,
  CAM_BACK_DIST:     10,
  CAM_POS_TAU:       0.12,
  CAM_UP_TAU:        0.05,
  CAM_FLOOR_MIN:     1.5,
};
