// ---- Tunnel geometry constants ----
export const TUNNEL_R   = 12;
export const TUNNEL_LEN = 900;
export const LANE_COUNT = 120;
export const LANE_ANGLE = (Math.PI * 2) / LANE_COUNT; // 0.05236 rad per lane
export const CAR_OFF    = 0.32;
export const DANGER_TIMEOUT   = 5.0;
export const BASE_SPEED_START = 32;

// ---- Camera constants ----
export const CAM_SPRING        = 52;
export const CAM_DAMP          = 13.5;
export const CAM_MAX_VEL       = 4.4;
export const CAM_FOV_NORMAL    = 66;
export const CAM_FOV_BOOST     = 110;
export const CAM_FOV_ENTER_S   = 3.0;
export const CAM_FOV_EXIT_S    = 3.0;
export const CAM_HEIGHT_NORMAL = 4.0;
export const CAM_HEIGHT_BOOST  = 2.0;
export const CAM_DIST_NORMAL   = 10;
export const CAM_DIST_FORWARD  = 14;
export const CAM_DIST_BACK     = 6;



// ---- Physics config ----
export const CFG = {
  steerAcceleration:   5.5, // prędkosć zmiany kierunku (lane/s)
  maxThetaVelocity:    3, // maksymalna prędkość kątowa (lane/s)

  baseSpeed:           60,
  forwardSpeed:        70,
  minSpeed:            12,
  boostSpeed:          95,
  acceleration:        5,
  speedForce:          10,
  speedFriction:       0.3, // siła hamowania przy braku gazu
  groundedFriction:    0.4, // siła hamowania przy kontakcie z tunelem, w tym na ścianach
  airFriction:         1.2, // siła hamowania w powietrzu, im większa, tym mniej "ślizgania" w powietrzu
  airControl:          1, // jak bardzo sterowanie działa w powietrzu (0-1), 0 to brak kontroli, 1 to pełna kontrola jak na ziemi
  jumpImpulse:         15.5,
  tunnelGravity:       36,
  maxRadialOffset:     10, // maksymalne odsunięcie od ściany tunelu, powyżej tego punktu gracz jest "w powietrzu"
  boostDrain:          0.32,
  boostRegen:          0.60, // szybkość regeneracji boosta (1 to pełna regeneracja w 1 sekundę)
};

// ---- Ball physics material ----
export const BALL_PHYS = {
  restitution:       0.7, // sprężystość, czyli jak bardzo piłka odbija się od ściany (0-1), 1 to idealnie sprężysta, 0 to brak odbicia

  inertiaDecay:      0.5, // jak szybko zanika bezwładność kątowa po utracie kontaktu ze ścianą, im większa wartość, tym szybciej piłka przestaje się obracać w powietrzu

  squashDuration:    0.05, // czas trwania efektu squasha po uderzeniu o ścianę
  squashAmount:      0.15, // jak bardzo piłka się spłaszcza przy uderzeniu o ścianę (0-1), 0.1 to 10% spłaszczenia
  stretchAmount:     0.15, // jak bardzo piłka się rozciąga przy uderzeniu o ścianę (0-1), 0.1 to 10% rozciągnięcia
  speedStretch:      0.0, // jak bardzo piłka się rozciąga przy dużej prędkości (0-1), 0.1 to 10% rozciągnięcia
  steerLagK:         3.5, // jak szybko wizualna reprezentacja samochodu dogania aktualną pozycję fizyczną, im większa wartość, tym szybciej nadąża (w sekundach^-1)
  
  surfaceDamp:       1, // jak bardzo mikro-odbicia przy kontakcie ze ścianą są tłumione, im większa wartość, tym bardziej tłumione
  surfaceDampRadius: 0.2, // promień od ściany, w którym zaczyna działać tłumienie mikro-odbicia, im większa wartość, tym dalej od ściany zaczyna działać tłumienie
  bounceThreshold:   5, // minimalna prędkość, przy której piłka zaczyna się odbijać od ściany, poniżej tego punktu piłka jest uważana za "nieruchomą" i nie będzie się odbijać, im większa wartość, tym szybciej piłka przestaje się odbijać i zaczyna być uważana za nieruchomą
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

// ---- Tunnel shader FX ----
export const TUNNEL_FX = {
  lavaStrength: 0.52,

  reflectionStrength: 0,
  reflectionZOffset: 1,

  reflectionLiftFadeStart: 0.35,
  reflectionLiftFadeEnd: 5.2,

  reflectionDarken: 0.18,
  reflectionTint: 1.70,
  reflectionHighlight: 0.55,
};
