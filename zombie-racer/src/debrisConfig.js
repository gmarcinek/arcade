// ═══════════════════════════════════════════════════════════════════
//  DEBRIS CONFIG — parametry fizycznego gruzu po wybuchu auta
// ═══════════════════════════════════════════════════════════════════

// ── Liczba kawałków ───────────────────────────────────────────────
// Minimalna liczba kawałków spawnionych przy wybuchu.
// Zakres: [8 mało … 20 normalne … 40 dużo]
export const DEBRIS_COUNT_MIN  = 45;

// Losowy naddatek — finalna liczba = COUNT_MIN + rand(COUNT_SPREAD).
// Zakres: [0 stała liczba … 6 normalne … 15]
export const DEBRIS_COUNT_SPREAD = 6;

// ── Rozmiar kawałka ───────────────────────────────────────────────
// Minimalny bok sześcianu [m].
// Zakres: [0.05 drobne … 0.22 normalne … 0.5]
export const DEBRIS_SIZE_MIN  = 0.22;

// Losowy naddatek — finalny rozmiar = SIZE_MIN + rand(SIZE_SPREAD).
// Zakres: [0.1 … 0.48 normalne … 1.0]
export const DEBRIS_SIZE_SPREAD = 0.48;

// ── Masa kawałka ──────────────────────────────────────────────────
// Udział masy auta (CAR_MASS) przypisany do jednego kawałka.
// Finalna masa = CAR_MASS * rand(MASS_FRAC_MIN … MASS_FRAC_MAX).
// Zakres frac: [1/200 lekkie … 1/40–1/5 normalne … 1/3 ciężkie]
export const DEBRIS_MASS_FRAC_MIN = 1 / 30;  // ~44 kg przy CAR_MASS=1750
export const DEBRIS_MASS_FRAC_MAX = 1 / 5;   // ~350 kg

// ── Rozrzut w miejscu spawnu ──────────────────────────────────────
// Połowa zakresu rozrzutu XZ względem epicentrum wybuchu [m].
// Zakres: [0.5 skupione … 2.5 normalne … 5.0 rozrzucone]
export const DEBRIS_SPAWN_SPREAD_XZ = 2.5;

// Minimalna wysokość nad epicentrum [m].
export const DEBRIS_SPAWN_Y_MIN     = 0.3;

// Losowy naddatek wysokości [m].
export const DEBRIS_SPAWN_Y_SPREAD  = 1.5;

// ── Tłumienie fizyki ──────────────────────────────────────────────
// Liniowe tłumienie prędkości kawałka (opór powietrza).
// Zakres: [0.05 długo leci … 0.20 normalne … 0.60 szybko spada]
export const DEBRIS_LINEAR_DAMPING  = 0.20;

// Kątowe tłumienie obrotu kawałka.
// Zakres: [0.1 kręci się długo … 0.40 normalne … 0.90 szybko zatrzymuje]
export const DEBRIS_ANGULAR_DAMPING = 0.40;

// ── Prędkość wybuchu ──────────────────────────────────────────────
// Minimalna prędkość burst [m/s].
// Zakres: [3 słaby … 10 normalne … 25 silny]
export const DEBRIS_BURST_MIN    = 10;

// Losowy naddatek prędkości burst [m/s].
// Zakres: [0 stałe … 18 normalne … 30]
export const DEBRIS_BURST_SPREAD = 18;

// Kąt stożka wybuchu [rad half-angle]. PI*0.45 ≈ ±81° (prawie półkula).
// Zakres: [PI*0.1 wąski … PI*0.45 normalne … PI pełna kula]
export const DEBRIS_CONE_HALF_ANGLE = Math.PI * 0.45;

// Udział prędkości auta dziedziczony przez kawałek (pęd nadany przez NPC).
// 0 = nie dziedziczy ruchu, 1.0 = pełny pęd auta.
// Zakres: [0.0 … 0.65 normalne … 1.0]
export const DEBRIS_INHERIT_VEL = 0.65;

// Minimalny upBias — jaka część prędkości idzie pionowo w górę.
// Zakres: [0.0 płasko … 0.35 normalne … 1.0 w górę]
export const DEBRIS_UP_BIAS_MIN    = 0.35;

// Losowy naddatek upBias.
// Zakres: [0.0 … 0.65 normalne]
export const DEBRIS_UP_BIAS_SPREAD = 0.65;

// Mnożnik pionowego składnika burst (0.85 = lekko przytłumione).
// Zakres: [0.5 … 0.85 normalne … 1.2]
export const DEBRIS_UP_MULTIPLIER  = 0.85;

// Minimalny pionowy pęd (zapobiega kawałkom lecącym w dół).
// Zakres: [0.5 … 2.0 normalne … 5.0]
export const DEBRIS_VEL_Y_MIN      = 2.0;

// Maksymalna prędkość kątowa spawnu [rad/s].
// Zakres: [5 wolno … 20 normalne … 50 szybko]
export const DEBRIS_ANGULAR_VEL    = 20;

// ── Wygląd ────────────────────────────────────────────────────────
export const DEBRIS_COLOR          = 0x111111;
export const DEBRIS_ROUGHNESS      = 0.88;
export const DEBRIS_METALNESS      = 0.25;
export const DEBRIS_EMISSIVE_COLOR = 0xff3300;

// Intensywność blasku zaraz po wybuchu (rozgrzany metal).
// Zakres: [0.2 … 0.9 normalne … 2.0 oślepiające]
export const DEBRIS_EMISSIVE_INTENSITY = 0.9;

// ── Czas życia — skalowany przez rozmiar kawałka ─────────────────
// Czas życia = LIFE_BASE + sz * LIFE_PER_METER
// Przykład przy domyślnych wartościach:
//   sz=0.22m (mały) → 5.0 + 0.22*22 ≈  9.8 s
//   sz=0.70m (duży) → 5.0 + 0.70*22 ≈ 20.4 s

// Bazowy czas życia kawałka [s] — tyle żyje nawet kawałek o rozmiarze 0.
// Zakres: [2 krótko … 5 normalne … 15 długo]
export const DEBRIS_LIFE_BASE        = 5.0;

// Naddatek czasu życia na metr rozmiaru [s/m].
// Zakres: [5 mała zależność … 22 normalne … 50 bardzo duża]
export const DEBRIS_LIFE_PER_METER   = 22.0;

// Bazowy czas emisji dymu/ognia [s].
export const DEBRIS_SMOKE_LIFE_BASE      = 1.5;

// Naddatek czasu dymu na metr rozmiaru [s/m].
export const DEBRIS_SMOKE_LIFE_PER_METER = 8.0;

// Bazowy czas żarzenia (emissive glow) [s].
export const DEBRIS_EMISSIVE_LIFE_BASE      = 1.0;

// Naddatek czasu żarzenia na metr rozmiaru [s/m].
export const DEBRIS_EMISSIVE_LIFE_PER_METER = 6.0;

// Losowy offset startu timera dymu (rozkłada chmurę w czasie).
// Zakres: [0 … 0.3 normalne … 1.0]
export const DEBRIS_SMOKE_TIMER_JITTER = 0.3;

// Minimalny interwał między pufami dymu [s].
export const DEBRIS_SMOKE_INTERVAL_MIN    = 0.22;

// Losowy naddatek interwału dymu [s].
export const DEBRIS_SMOKE_INTERVAL_SPREAD = 0.30;

// Próg smokeLife [s] poniżej którego ogień zamienia się w czarny dym.
// Zakres: [0.5 … 2.0 normalne]
export const DEBRIS_SMOKE_FIRE_THRESHOLD = 2.0;

// Prawdopodobieństwo że dymu będzie "fire" (vs "black") powyżej progu.
// Zakres: [0.0 zawsze czarny … 0.55 normalne … 1.0 zawsze ogień]
export const DEBRIS_SMOKE_FIRE_CHANCE = 0.55;

// Czas fade-out przed usunięciem [s] (opacity → 0).
// Zakres: [0.5 … 2.0 normalne … 5.0]
export const DEBRIS_FADE_TIME      = 2.0;

// ── Audio uderzeń gruzu ───────────────────────────────────────────
// Tylko kawałki co najmniej tej wielkości mogą grać sample przy kolizji.
// Zakres: [0.2 małe też grają … 0.45 normalne … 0.8 tylko największe]
export const DEBRIS_HIT_SOUND_SIZE_MIN = 0.42;

// Minimalna prędkość impaktu [m/s], od której gruz może zagrać sample.
// Zakres: [1.5 czułe … 4.5 normalne … 10 tylko brutalne hity]
export const DEBRIS_HIT_SOUND_SPEED_MIN = 4.5;

// Cooldown między kolejnymi dźwiękami tego samego kawałka [s].
// Zakres: [0.1 często … 0.35 normalne … 1.0 rzadko]
export const DEBRIS_HIT_SOUND_COOLDOWN = 0.35;
