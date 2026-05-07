// ---- Tunnel geometry constants ----
export const TUNNEL_R   = 12;
export const BALL_R     = 0.9;  // ball mesh radius (m)
export const TUNNEL_LEN = 1200;
export const LANE_COUNT = 120;
export const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT; // 0.05236 rad per lane
export const CAR_OFF    = 0.32; //
export const DANGER_TIMEOUT   = 2.0;
export const OUT_OF_BOUNDS_KILL_S = 1.0;
export const DEATH_BLAST_DURATION_S = 2.0;
export const DEATH_BLAST_SCALE_MAX = 10.0;
export const BASE_SPEED_START = 32;
export const RESTART_SPAWN_M  = 80;

// ---- Camera constants ----
export const CAM_SPRING        = 52; // spring stiffness (N/m) — higher = tighter spring, more rubber-banding; lower = looser spring, more floaty feel
export const CAM_DAMP          = 13.5; // critically damped at ~13.5, lower for more floaty feel
export const CAM_MAX_VEL       = 4.4; // max camera velocity (prevents extreme rubber-banding when player clips into wall)
export const CAM_FOV_NORMAL    = 70;
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
  // ── Lateral rolling physics ──
  driveTorque:         18,    // rad/s² — torque applied to ball spin by player input
  rollingFriction:     28,    // coupling strength between ball spin and tunnel position (higher = grippier)
  spinDecay:           0.4,   // rad/s² decay of ball spin in air (gyroscopic momentum)
  airLateralDecay:     0.15,  // decay of thetaVelocity in air (low = floaty drift)
  bounceSpinTransfer:  0.25,  // fraction of tangential velocity converted to spin on impact
  maxThetaVelocity:    4,     // hard cap on tunnel angular velocity (rad/s)
  tunnelAngularGravity: 0.0,  // rad/s² — pendulum pull toward tube floor (theta=0); tune per difficulty

  // ── Radial physics ──
  jumpImpulse:         15.5, // initial radial velocity from jump (m/s)
  tunnelGravity:       36, // radial acceleration toward tube center when airborne (m/s²)
  maxRadialOffset:     10, // max distance from tube center (for crash)

  // ── Forward speed ──
  baseSpeed:           80,
  forwardSpeed:        90,
  boostSpeed:          95,
  acceleration:        0.2,
  speedForce:          10,
  speedFriction:       0.3,
  boostDrain:          0.20,
  boostRegen:          0.35,
  airControl:          1,
};

// ---- Edge heat zone (open surfaces) ----
export const EDGE_HEAT_ZONE_M   = 4.0;   // metres from edge where heat starts (danger strip width)
export const EDGE_HEAT_RATE     = 0.6;   // heat accumulated per second at full proximity
export const EDGE_HEAT_COOL     = 0.18;  // heat lost per second when out of danger zone

// ---- Boost-heat interaction ----
export const BOOST_HEAT_RATE   = 0.20;  // heat/sec accumulated while boosting
export const BOOST_HEAT_CUTOFF = 0.35;  // heat level that force-kills boost
export const BOOST_HEAT_REARM  = 0.20;  // heat must drop below this before boost can re-arm
export const BOOST_MIN_FUEL    = 0.85;  // fraction of boost fuel required to start boost

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
  SPEED_MAX:             110,
  SPEED_BOOST:           150,
  STEER_ACCELERATION:    5,
  MAX_U_VELOCITY:        9,

  KAPPA_INTERVAL: 230, // steps between new curvature targets
  KAPPA_MIN: -1.0, // min curvature (1/radius) for procedural segments; controls max turn tightness; tune with MAX_TURN_XZ
  KAPPA_MAX: +1.8, // max curvature (1/radius) for procedural segments; controls max turn tightness; tune with MAX_TURN_XZ

  ARC_INTERVAL: 450, // steps between new arc length targets

  ARC_MIN: 0.3, // min arc length for procedural segments; controls how long turns last; tune with MAX_TURN_XZ and KAPPA_MAX

  ARC_MAX: 1.0, // max arc length for procedural segments; controls how long turns last; tune with MAX_TURN_XZ and KAPPA_MAX

  TWIST_INTERVAL: 300,  // steps between new twist targets

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
