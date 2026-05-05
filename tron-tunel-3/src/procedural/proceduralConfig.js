export const PROC_CFG = {
  // Segment geometry
  SEGMENT_LENGTH_MIN:    290,
  SEGMENT_LENGTH_MAX:    310,   // ~300m segments
  MAX_TURN_XZ:           0.524, // 30° max horizontal turn (π/6)
  MAX_TURN_Y:            0.10,  // very gentle vertical variation
  CONTROL_POINTS_MIN:    1,     // ONE intermediate point = one smooth arc per segment
  CONTROL_POINTS_MAX:    1,

  // Safe track
  SAFE_TRACK_SAMPLES:    200, // number of discrete safe track samples per segment (for pathfinding)
  SAFE_TRACK_WIDTH:      4.0,   // world units width of safe zone

  // Chunk streaming
  LOOKAHEAD_SEGMENTS:    2,
  TRAIL_SEGMENTS:        1,

  // Speed (proc-specific, overrides CFG for procedural player)
  SPEED_BASE:            100,    // ~288 km/h
  SPEED_MAX:             120,   // max forward
  SPEED_BOOST:           160,   // boost speed
  STEER_ACCELERATION:    5,     // angular steer accel (rad/s²) — lower so player fights inertia
  MAX_U_VELOCITY:        9,     // max angular velocity (rad/s)
  ANGULAR_GRAVITY:       0,     // gravity toward tube floor (rad/s²)

  KAPPA_INTERVAL: 300,   // meters between curvature transitions
  KAPPA_MIN: 0.5,       // most anti-tube (ball outside)
  KAPPA_MAX: +1 ,       // full closed tube (ball inside)

  ARC_INTERVAL: 350,  // meters between arc span transitions
  ARC_MIN: 0.4,      // narrowest strip (fraction of full circle, 0–1)
  ARC_MAX: 1.0,       // widest strip (1.0 = full tube)
  TWIST_INTERVAL: 300,  // meters between twist transitions (-0.5 to +0.5 full rotations)

  // Camera look-ahead: blend of spline samples ahead (weights must sum to 1)
  CAM_LOOKAHEAD_OFFSETS: [8, 18, 30],  // metres ahead to sample
  CAM_LOOKAHEAD_WEIGHTS: [0.40, 0.35, 0.25],  // blend weights (sum=1)
  CAM_LOOKAHEAD_TAU:     0.25,   // smoothing time constant for look-ahead point (s)

  // Camera position
  CAM_HEIGHT:        3.5,   // metres above surface normal
  CAM_BACK_DIST:     10,    // metres behind ball along look axis
  CAM_POS_TAU:       0.12,  // position spring tau (s)
  CAM_UP_TAU:        0.35,  // up-vector spring tau (s)
  CAM_FLOOR_MIN:     1.5,   // min distance from surface (floor avoidance)
};
