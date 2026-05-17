// ---- Stałe geometrii tunelu ----
export const TUNNEL_R   = 12;
export const BALL_R     = 0.9;  // promień siatki piłki (m)
export const TUNNEL_LEN = 1200;
export const LANE_COUNT = 120;
export const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT; // 0.05236 rad na pas
export const CAR_OFF    = 0.32;
export const DANGER_TIMEOUT   = 2.0;
export const OUT_OF_BOUNDS_KILL_S = 2.0;  // sekundy do śmierci gdy piłka poza tunelem
export const DEATH_BLAST_DURATION_S = 2.0; // czas animacji wybuchu śmierci (s)
export const DEATH_BLAST_SCALE_MAX = 10.0; // maksymalna skala wybuchu
export const BASE_SPEED_START = 12;
export const RESTART_SPAWN_M  = 80;

// ---- Stałe kamery ----
export const CAM_SPRING        = 52; // sztywność sprężyny (N/m) — wyżej = ciaśniejsza, więcej gumowania; niżej = luźniejsza, bardziej płynna
export const CAM_DAMP          = 13.5; // krytyczne tłumienie przy ~13.5; niżej = bardziej płynna kamera
export const CAM_MAX_VEL       = 4.4; // maks. prędkość kamery (zapobiega szarpnięciom gdy gracz wpada w ścianę)
export const CAM_FOV_NORMAL    = 70; // FOV normalny (stopnie)
export const CAM_FOV_BOOST     = 110;
export const CAM_FOV_ENTER_S   = 3.0;
export const CAM_FOV_EXIT_S    = 3.0;
export const CAM_HEIGHT_NORMAL = 4.0;
export const CAM_HEIGHT_BOOST  = 2.0;
export const CAM_DIST_NORMAL   = 6;
export const CAM_DIST_FORWARD  = 14;
export const CAM_DIST_BACK     = 4;

// ---- Konfiguracja fizyki ----
export const CFG = {
  // ── Fizyka toczenia bocznego ──
  driveTorque:         28,    // rad/s² — moment obrotowy nadawany piłce przez input gracza
  rollingFriction:     28,    // siła sprzężenia obrotu piłki z pozycją w tunelu (wyżej = większa przyczepność)
  spinDecay:           55,   // rad/s² zanik obrotu piłki w powietrzu (moment bezwładności)
  airLateralDecay:     0.15,  // zanik prędkości bocznej w powietrzu (niżej = bardziej dryfuje)
  bounceSpinTransfer:  0.25,  // ułamek prędkości stycznej zamieniany na spin przy odbiciu
  maxThetaVelocity:    44,     // twarde ograniczenie prędkości kątowej w tunelu (rad/s)

  // ── AUTOPILOT: 
  // automatyczne wyrównywanie trajektorii — im wyższe, tym silniej tunel "ciągnie" piłkę do środka pasa (u=π); 0 = wyłącz autopilota, 2–5 = subtelne wyrównywanie, 8+ = silne przyciąganie do środka pasa
  tunnelAngularGravity: 0.0,  // rad/s² — sprężyna ku centrum widocznego łuku (u=π); 0 = wyłącz, 2–5 = subtelne, 8+ = silne przyciąganie
  tunnelAngularDamp:    15,   // 0–100 — tłumienie wyrównywacza trajektorii; 0 = czysta sprężyna (oscylacje), 100 = krytyczne (bez przebiegu)

  // ── Fizyka radialna ──
  jumpImpulse:         17, // początkowa prędkość radialna skoku (m/s)
  tunnelGravity:       36, // przyspieszenie radialne ku środkowi tunelu gdy w powietrzu (m/s²)
  maxRadialOffset:     10, // maksymalna odległość od środka tunelu (crash)

  // ── Naładowany skok ──
  jumpChargeTime:    3.0,  // sekundy do pełnego naładowania
  jumpMinFactor:     0.10, // mnożnik mocy przy natychmiastowym tapnięciu (10%)
  jumpMaxFactor:     2.00, // mnożnik mocy przy pełnym naładowaniu (200%)

  // ── Prędkość do przodu ──
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

// ---- Strefa ciepła przy krawędzi (otwarte powierzchnie) ----
export const EDGE_HEAT_ZONE_M   = 4.0;   // metry od krawędzi, od których zaczyna się ciepło
export const EDGE_HEAT_RATE     = 0.6;   // ciepło narastające na sekundę przy pełnej bliskości
export const EDGE_HEAT_COOL     = 0.18;  // ciepło opadające na sekundę poza strefą

// ---- Interakcja boosta z ciepłem ----
export const BOOST_HEAT_RATE   = 0.20;  // ciepło/s narastające podczas boostowania
export const BOOST_HEAT_CUTOFF = 0.35;  // poziom ciepła wymuszający wyłączenie boosta
export const BOOST_HEAT_REARM  = 0.20;  // ciepło musi spaść poniżej tej wartości by boost mógł się ponownie naładować
export const BOOST_MIN_FUEL    = 0.85;  // ułamek paliwa wymagany do uruchomienia boosta

// ---- Materiał fizyki piłki ----
export const BALL_PHYS = {
  restitution:       0.7, // sprężystość odbicia (0 = martwa, 1 = idealna)
  inertiaDecay:      0.08, // zanik prędkości kątowej (tarcie) na sekundę; wyżej = szybsze hamowanie obrotów

  squashDuration:    0.05, // sekundy animacji spłaszczenia/rozciągnięcia przy uderzeniu
  squashAmount:      0.15,  // maksymalne spłaszczenie w szczycie (0.15 = 15% mniejszy)
  stretchAmount:     0.15,  // maksymalne rozciągnięcie w szczycie (0.15 = 15% większy)
  speedStretch:      0.0, // dodatkowe rozciągnięcie proporcjonalne do prędkości uderzenia (0.0 = brak)

  surfaceDamp:       1,
  surfaceDampRadius: 0.2,
  bounceThreshold:   5,
};

// ---- Materiał wizualny piłki ----
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

// ---- Konfiguracja wizualna fali skoku ----
export const JUMP_WAVE_CONFIG = {
  speedMult:        2.0,   // prędkość fali = prędkość gracza × speedMult
  speedRandRange:   0.2,   // ±losowy rozrzut prędkości (0 = brak, 0.2 = ±10%)
  duration:         6.0,   // sekundy do całkowitego zaniku fali
  envelopeBase:    16.0,   // szerokość obwiedni Gaussa przy wieku=0 (m)
  envelopeGrow:     16.0,   // przyrost szerokości obwiedni na sekundę
  oscillationCycle: 16.0,  // długość pełnego cyklu sinusoidy (m): garb + dołek
  waveAmp:          0.18,  // amplituda oscylacji garb-dołek (ułamek promienia)
  pushAmp:          0.42,  // amplituda radialnego wypychania (ułamek promienia)
  pushWidthBase:   16.0,   // szerokość Gaussa wypychania przy wieku=0 (m)
  pushWidthGrow:    16.0,   // przyrost szerokości wypychania na sekundę
  pushOffset:       8.0,   // przesunięcie środka wypychania za frontem fali (m)
  glowBlue:         1.12,  // intensywność poświaty — kanał elektrycznego błękitu
  glowWhite:        2.70,  // intensywność poświaty — kanał białego połysku
};

// ---- Efekty shadera tunelu ----
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
  SAFE_TRACK_SAMPLES:    300, // number of points sampled along track to evaluate safe track; higher = more accurate but more CPU usage

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
  KAPPA_MIN: -1.0,
  KAPPA_MAX: +3.8, // curvature range (higher = more intense tube bends; lower = flatter tube)

  ARC_INTERVAL_MIN: 200, // min steps between arc-width targets
  ARC_INTERVAL_MAX: 250, // max steps between arc-width targets

  ARC_MIN: 0.1, 
  ARC_MAX: 0.99, 

  TWIST_INTERVAL_MIN: 90, // min steps between twist targets
  TWIST_INTERVAL_MAX: 450, // max steps between twist targets

  // Camera look-ahead
  CAM_LOOKAHEAD_OFFSETS: [8, 18, 30],
  CAM_LOOKAHEAD_WEIGHTS: [0.40, 0.35, 0.25],
  CAM_LOOKAHEAD_TAU:     0.25,

  // Camera position
  CAM_HEIGHT:        3.5,
  CAM_BACK_DIST:     10,
  CAM_POS_TAU:       0.12,
  CAM_UP_TAU:        0.15,
  CAM_FLOOR_MIN:     1.5,
};

// ---- Audio-driven tunnel generation ----
// Controls how AudioMetadataBus fields influence the procedural spline shape.
// All effects are disabled when no audio is active (bus returns zero values).
export const AUDIO_TUNNEL = {
  enabled: true,

  // ── 3 source assignments ─────────────────────────────────────────────────
  // Swap any of these to a different AudioMetadataBus field to change what drives what.
  // Available fields: 'bassImpact', 'low', 'sub', 'mid', 'high', 'rms',
  //                   'midWave', 'ribbonDrive', 'lavaLight', 'onsetPulse',
  //                   'beatPulse', 'energyRamp'  (>0 = crescendo, <0 = decrescendo)
  beatSrc:  'isOnset',     // Beat events   → triggers a new curve turn every beatDiv beats
  kappaSrc: 'bassImpact',  // 0–1+ float    → scales bend angle   (try 'energyRamp' for crescendo)
  twistSrc: 'midWave',     // 0–1 float     → rolls the tunnel cross-section (melody / mid-freq)

  // ── Beat → curve density ─────────────────────────────────────────────────
  // Every beatDiv detected beats, cut the current hold short to force a new turn.
  // Higher = beat-synced turns less frequent.
  beatDiv:     4,
  // When a beat fires: yawHoldSteps is cut to this range (steps, 1 step = 5 m).
  beatHoldMin: 6,
  beatHoldMax: 14,

  // ── Kappa → bend magnitude ────────────────────────────────────────────────
  // Multiplier range on the effective turn-yaw angle per spline step:
  //   at silence / zero  → normal bend × kappaMin
  //   at peak            → normal bend × kappaMax
  kappaMin:   0.4,
  kappaMax:   1.8,
  // Scale on the raw source value before the min/max lerp (0 = no effect on bends).
  kappaScale: 1.0,

  // ── Twist → tunnel roll ───────────────────────────────────────────────────
  // Applied in real-time in the mesh (InfiniteMesh), NOT baked into the spline.
  // This means the player experiences the correct twist at exactly the right moment.
  // twistRate: roll velocity in rad/s when source is at max/min.
  //   positive source (>0.5) → rolls in one direction; below 0.5 → reverses.
  twistRate:  0.6,    // rad/s; try 0.3 (subtle) to 2.0 (aggressive barrel feel)
  twistScale: 1.0,    // 0 = no twist, >1 = exaggerated
};
