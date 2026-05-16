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
  driveTorque:         28,    // rad/s² — torque applied to ball spin by player input
  rollingFriction:     28,    // coupling strength between ball spin and tunnel position (higher = grippier)
  spinDecay:           55,   // rad/s² decay of ball spin in air (gyroscopic momentum)
  airLateralDecay:     0.15,  // decay of thetaVelocity in air (low = floaty drift)
  bounceSpinTransfer:  0.25,  // fraction of tangential velocity converted to spin on impact
  maxThetaVelocity:    44,     // hard cap on tunnel angular velocity (rad/s)
  tunnelAngularGravity: 0.0,  // rad/s² — pendulum pull toward tube floor (theta=0); tune per difficulty

  // ── Radial physics ──
  jumpImpulse:         17, // initial radial velocity from jump (m/s)
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
  restitution:       0.7, // bounciness (0 = dead, 1 = perfect)
  inertiaDecay:      0.08, // angular velocity decay (friction) applied each second; higher = quicker slowdown of spins and rolls

  squashDuration:    0.05, // seconds of squash/stretch animation on impact
  squashAmount:      0.15,  // max scale reduction at peak of squash (0.15 = 15% smaller); also controls stretch amount for same duration
  stretchAmount:     0.15,  // max scale increase at peak of stretch (0.15 = 15% bigger); also controls squash amount for same duration
  speedStretch:      0.0, // additional stretch proportional to impact speed (0.0 = no stretch, 0.01 = 1% stretch per m/s of impact velocity)

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
  envMapIntensity: 15.0,
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
  SEGMENT_LENGTH_MIN:    170,
  SEGMENT_LENGTH_MAX:    310,
  
  MAX_TURN_XZ:           0.524, // max turn angle around horizontal axes (pitch/yaw); higher = more intense turns but more disorienting
  
  MAX_TURN_Y:            0.524, // max turn angle around forward axis (roll); higher = more intense barrel rolls but more disorienting

  CONTROL_POINTS_MIN:    4, // min number of control points per segment; higher = more varied track but more erratic; lower = smoother track but more predictable

  CONTROL_POINTS_MAX:    4, // max number of control points per segment; higher = more varied track but more erratic; lower = smoother track but more predictable

  // Safe track
  SAFE_TRACK_SAMPLES:    100, // number of points sampled along track to evaluate safe track; higher = more accurate but more CPU usage

  // Chunk streaming
  LOOKAHEAD_SEGMENTS:    3, // number of segments ahead of player to keep loaded; higher = smoother streaming but more CPU/memory usage
  TRAIL_SEGMENTS:        2,

  // Speed (proc-specific)
  SPEED_BASE:            60,
  SPEED_MAX:             110,
  SPEED_BOOST:           150,
  STEER_ACCELERATION:    5, //
  MAX_U_VELOCITY:        9, //

  KAPPA_INTERVAL_MIN: 150, // min steps between curvature targets (shorter = quicker turns)
  KAPPA_INTERVAL_MAX: 450, // max steps between curvature targets (longer = more sustained turns)
  KAPPA_MIN: -0.8,
  KAPPA_MAX: +2.8,

  ARC_INTERVAL_MIN: 200, // min steps between arc-width targets
  ARC_INTERVAL_MAX: 650, // max steps between arc-width targets

  ARC_MIN: 0.3,
  ARC_MAX: 1.0,

  TWIST_INTERVAL_MIN: 140, // min steps between twist targets
  TWIST_INTERVAL_MAX: 450, // max steps between twist targets

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
