// ═══════════════════════════════════════════════════════════════════
//  PHYSICS CONFIG — wszystkie parametry fizyczne w jednym miejscu
//  Kazda wartosc ma opis efektu i sensowny zakres [min … max]
// ═══════════════════════════════════════════════════════════════════

// ── Swiat ──────────────────────────────────────────────────────────
// Sila grawitacji. Wyzsze odczucia ciezkosci, szybsze ladowanie po skoku.
// Zakres: [-9.8 ziemska … -30 bardzo ciezkie]
export const GRAVITY = -10.8;

// ── Podwozie / masa ────────────────────────────────────────────────
// Masa nadwozia [kg]. Wyzsza = wolniejsze przyspieszenie i hamowanie, wiekszy impet przy zderzeniu.
// Zakres: [400 sportowe … 800 normalne … 1200 SUV/ciezarowka]
// Skoda Kodiaq 2.0 TSI: masa wlasna ~1750 kg
export const CAR_MASS = 1750;

// Przesuniecie srodka masy w bok [m]. 0 = symetria. Zmiana powoduje nierowne przechyly L/P.
// Zakres: [-0.3 … 0.3]  (zwykle 0)
export const CHASSIS_COM_OFFSET_X = 0;

// Wysokosc srodka masy [m] nad podstawa pudla kolizyjnego.
// Wyzej = auto chetniej sie przechyla i wywraca w zakretech.
// Zakres: [0.0 nisko/stabilnie … 0.6 wysoko/niestabilnie]
// Kodiaq: CoM ~620mm od ziemi, SUV wiec wysoko
export const CHASSIS_COM_OFFSET_Y = 0.1;

// Przesuniecie srodka masy w przod/tyl [m].
// Ujemne (przod) = understeer (auto jedzie prosto, trudniej skrecic).
// Dodatnie (tyl) = oversteer (tyl wyslizguje sie w zakretech).
// Zakres: [-0.5 … 0.5]  (zwykle 0)
// Kodiaq FWD: nieznacznie przesuniete do przodu (lekki understeer)
export const CHASSIS_COM_OFFSET_Z = 0;

// Tlumienie obrotu nadwozia. Zapobiega kreceniu sie w miejscu po zderzeniu.
// Wyzsze = auto szybciej przestaje sie krecic, mniej "pinball".
// Zakres: [0.1 brak tlumienia … 0.9 normalne … 1.0 natychmiastowe zatrzymanie obrotu]
// Kodiaq: realistyczne tlumienie — auto moze sie krecic po wywrotce
// 2× podwyższone dla lepszego feel'u + dynamiczne zwiększenie przy szybkim obrocie
export const ANGULAR_DAMPING = 0.2;

// Tlumienie predkosci liniowej (opor powietrza + toczenia).
// Wyzsze = auto samo zwalnia szybciej gdy puszczasz gaz.
// Zakres: [0.01 slizga sie jak lod … 0.1 normalne … 0.5 bardzo duze tlumienie]
// Kodiaq: Cx=0.36, przy G=-9.8 niskie liniowe tlumienie jest realistyczne
export const LINEAR_DAMPING = 0.005;

// ── Silnik / sterowanie ────────────────────────────────────────────
// Maksymalna sila silnika na kolo napedowe [N].
// Wyzsze = szybsze przyspieszenie i wyzsza predkosc max.
// Zakres: [2000 slabe … 5000 normalne … 10000 wyscigowe]
// Kodiaq 2.0 TSI 140kW: 0-100 ~7.5s → F=1750*3.7=6475N łącznie / 2 kola FWD
export const MAX_ENGINE_FORCE = 18000;

// Maksymalny kat skretu kol przednich [rad].
// Wyzsze = ostrzejsze skrety, ale tez latwiej wpasc w poslizg.
// Zakres: [0.3 mala skretnosc … 0.5 normalna … 0.8 bardzo skretne]
// Kodiaq: promien skretu 11.1m, rozstaw 2.79m → kat ~0.26rad, z zapasem ~0.45
export const MAX_STEER = 0.75;

// Sila hamulcow na kazde kolo [N*m].
// Wyzsze = krotszy dystans hamowania. Za wysokie = natychmiastowe blokowanie kol.
// Zakres: [20 slabe … 60 normalne … 150 wyscigowe]
// Kodiaq: opoznienie hamowania ~9.5 m/s2 → F=1750*9.5/4=4156N/kolo, w sim ~80
export const BRAKE_FORCE = 320;

// ── Kola — geometria ──────────────────────────────────────────────
// Promien kola [m]. Wplywa na predkosc obrotowa i przesit.
// Zakres: [0.3 male … 0.55 normalne … 0.8 monster truck]
// Kodiaq: opona 235/55R17 → r = (17*25.4/2 + 235*0.55) / 1000 = 0.345m
export const WHEEL_RADIUS = 0.35;

// Odleglosc kola od osi symetrii auta (pulos) [m].
// Szerzej = stabilniejsze w zakretech, wezej = bardziej zwrotne.
// Zakres: [0.8 … 1.15 normalne … 1.5]
// Kodiaq: tor przedni 1598mm / 2 = 799mm = 0.80m
export const WHEEL_POS_X = 0.9;

// Odleglosc przednich kol od srodka auta [m] (rozstaw osi przod).
// Zakres: [1.2 … 1.85 normalne … 2.5]
// Kodiaq: rozstaw osi 2791mm / 2 = 1396mm = 1.40m
export const WHEEL_POS_Z_FRONT = 1.45;

// Odleglosc tylnych kol od srodka auta [m] (rozstaw osi tyl).
// Zakres: [1.2 … 1.85 normalne … 2.5]
export const WHEEL_POS_Z_REAR = 1.40;

// ── Zawieszenie ────────────────────────────────────────────────────
// Sztywnosc sprezyny zawieszenia [N/m].
// Nizsze = miekkie (duze bujanie, dobra absorpcja), wyzsze = twarde (stabilne, malo ugiecia).
// Zakres: [10 bardzo miekkie … 22 normalne … 50 twarde sportowe]
// Kodiaq: komfortowe zawieszenie, z G=-9.8 potrzeba wyzszej wartosci niz z G=-20
export const SUSPENSION_STIFFNESS = 22;

// Naturalna dlugosc amortyzatora w spoczynku [m].
// Wplywa na przesit auta nad ziemia. Za male = kola wchodza w podwozie.
// Zakres: [0.3 … 0.55 normalne … 0.8]
// Kodiaq: przeswit ~200mm, dlugosc amortyzatora ~380mm
export const SUSPENSION_REST_LENGTH = 0.40;

// Maksymalny skok zawieszenia [m] (ile moze sie uginac od pozycji spoczynkowej).
// Wyzsze = auto lepiej pokonuje nierownosci i skacze wyzej z ramp.
// Zakres: [0.2 twarde … 0.6 normalne … 1.2 off-road]
// Kodiaq: skok ~170mm każda strona = 0.17m, z zapasem 0.45
export const SUSPENSION_MAX_TRAVEL = 0.45;

// Maksymalna sila jaka zawieszenie moze wywrzec na nadwozie [N].
// Za niskie = auto "przebija" zawieszenie i lezy na ziemi. Zwykle nie trzeba zmieniac.
// Zakres: [50000 … 100000 normalne … 200000]
// Kodiaq ciezsze (1750kg) → wyzszy limit
export const SUSPENSION_MAX_FORCE = 150000;

// Tlumienie rozprezania amortyzatora (jak wolno wraca po scisnieciu).
// Nizsze = zawieszenie "odbija" (auto sie buja dlugo po nierownosci).
// Wyzsze = szybkie tlumienie, stabilne ale twarde.
// Zakres: [0.5 bardzo miekkie … 1.8 normalne … 4.0 bardzo twarde]
// Kodiaq: komfortowe, srednie tlumienie
export const DAMPING_RELAXATION = 2.3;

// Tlumienie sciskania amortyzatora (jak wolno ugina sie przy najezdzie).
// Wyzsze = twarde uderzenia przy nierownosci, auto mniej "zanurza sie" w zakretech.
// Zakres: [0.5 … 2.8 normalne … 5.0 twarde]
export const DAMPING_COMPRESSION = 3.2;

// Wplyw sil zawieszenia na przechyl nadwozia (roll).
// To GLOWNY parametr decydujacy o wywracaniu sie auta.
// Nizkie = stabilne, wysokie = auto wywraca sie przy skretach.
// Wplywa tez na to czy "snap" przy przejezdzie trawa→asfalt skończy sie spinem (obrót Y)
// czy wywrotka (obrót X). Powyzej ~0.15 przy duzych predkosciach wywrotka staje sie mozliwa.
// Zakres: [0.01 praktycznie nie wywraca … 0.08 normalne … 0.2 wywraca sie latwo … 1.0 ekstremalnie niestabilne]
// Kodiaq SUV: przy G=-9.8 i wysokim CoM, 0.18 daje realistyczne ryzyko wywrotki
export const ROLL_INFLUENCE = 0.18;

// ── Przyczepnosc kol ──────────────────────────────────────────────
// frictionSlip to wewnetrzny parametr cannon-es RaycastVehicle.
// Wyzsze = lepsze trzymanie drogi, mniejszy poslizg boczny i podluzny.
// UWAGA: to NIE jest coefficient of friction — to skala sily poprzecznej kola.

// Przyczepnosc przednich kol (napedowych) przy niskiej predkosci.
// Zakres: [1.0 slisko … 3.0 normalne … 6.0 racing slick]
// Kodiaq: letnie opony 235/55R17, asfalt suchy → 3.5
export const FRICTION_SLIP_FRONT_STATIC = 3.5;

// Przyczepnosc tylnych kol przy niskiej predkosci.
// Nizsze niz przod = tendencja do oversteeru (tyl wyslizguje sie).
// Zakres: [1.0 … 6.0]
// Kodiaq FWD: tyl lzejszy, nieznacznie mniejsza przyczepnosc
export const FRICTION_SLIP_REAR_STATIC = 3.2;

// Przyczepnosc przednich kol przy pelnym bocznym poslizgu.
// Im nizsze wzgledem STATIC, tym bardziej wyrazisty poslizg.
export const FRICTION_SLIP_FRONT_DYNAMIC = 0.5;

// Przyczepnosc tylnych kol przy pelnym bocznym poslizgu.
// Tyl traci przyczepnosc szybciej → naturalne oversteer zachowanie.
export const FRICTION_SLIP_REAR_DYNAMIC = 0.1;

// Boczna predkosc poslizgu kola [m/s] od ktorej zaczyna sie degradacja.
// Ponizej tej wartosci: pelna przyczepnosc. 2 m/s ≈ opona zaczyna sie slizgac bocznie.
// Zakres: [1.0 czule … 3.0 normalne … 6.0 odporne]
export const LAT_SLIP_SPEED_MIN = 1.0;

// Boczna predkosc [m/s] przy ktorej osiagamy pelny poslizg dynamiczny.
// Zakres: [LAT_SLIP_SPEED_MIN+2 … 8.0 normalne … 15.0]
export const LAT_SLIP_SPEED_MAX = 7.0;

// ── Nawierzchnie — przyczepnosc kolo-podloze ──────────────────────
// ContactMaterial friction w cannon-es. Mnozy przyczepnosc przy kontakcie kola z podlozem.
// Wyzsze = lepszy kontakt, trudniejszy poslizg nadwozia.
//
// EFEKT PRZEJAZDU TRAWA → ASFALT podczas bocznego poslizgu:
//   - Na trawie: male sily boczne, poslizg jest stabilny
//   - Po wjezdzie na asfalt: sily boczne rosna nagle (2x)
//   - Efekt: spin (obrot auta) lub wywrotka — zalezy od ROLL_INFLUENCE i predkosci
//   - Zeby zwiekszyc "snap" efekt: podwyzsz FRICTION_ASPHALT lub ROLL_INFLUENCE

// Trawa — bazowa przyczepnosc (1x). Grunt miedzy drogami.
// Zakres: [0.1 bloto … 0.5 trawa … 0.9 sucha ziemia]
// Realistyczne: sucha trawa μ ≈ 0.35-0.45
export const FRICTION_GRASS = 0.2;

// Asfalt — lepsza przyczepnosc niz trawa (2x). Drogi i chodniki.
// Im wieksza roznica miedzy GRASS a ASPHALT, tym silniejszy "snap" przy przejezdzie podczas poslizgu.
// Zakres: [0.7 mokry … 1.0 suchy … 1.3 racing tarmac]
// Realistyczne: suchy asfalt μ ≈ 0.7-0.9
export const FRICTION_ASPHALT = 0.4;

// Kaluz / piasek — niska przyczepnosc (0.4x). Trudny teren.
// Zakres: [0.05 lod … 0.2 kaluz/piasek … 0.4 zwir]
// Realistyczne: mokra nawierzchnia μ ≈ 0.15-0.25
export const FRICTION_SLICK = 0.18;

// Predkosc obrotu kola [rad/s] gdy kolo slizga sie (frictionSlip przekroczony).
// Ujemna = kolo obraca sie do przodu (normalny poślizg). Bardziej ujemna = szybszy spin.
// Wplywa glownie na wizualny efekt (obrot meshu kola), nie na sile fizyczna.
// Zakres: [-60 szybki spin … -30 normalne … -10 wolny]
export const WHEEL_SLIDE_SPEED = -50;

// Domyslna przyczepnosc dla par materialow bez dedykowanego ContactMaterial.
// Uzywa jej np. fizyczne ciala budynkow vs. podloze. Nie wplywa bezposrednio na kola.
// Zakres: [0.1 … 0.3 normalne … 0.8]
export const DEFAULT_CONTACT_FRICTION = 0.3;

// ── Zderzenia — obrazenia ─────────────────────────────────────────
// Predkosc [m/s] ponizej ktorej zderzak calkowicie pochlania uderzenie (brak obrazen).
// (~18 km/h przy 5). Wyzsze = auto bardziej odporne na drobne stluczki.
// Zakres: [2 bardzo czule … 5 normalne … 12 bardzo odporne]
export const BUMPER_SPEED_THRESHOLD = 15;

// Mnoznik sily przy uderzeniu w budynek/drzewo/bariere.
// damage_hp = (speed - threshold) * SCALE * DAMAGE_PER_IMPULSE * 100
// Przy SCALE=400, predkosci 10 m/s: (10-5)*400*0.0008*100 = 16 HP
// Zakres: [100 … 400 normalne … 1000 brutalne]
export const BUILDING_IMPACT_SCALE = 400;

// Mnoznik sily przy zderzeniu auto-auto.
// Zakres: [100 … 400 normalne … 1000 brutalne]
export const CAR_IMPACT_SCALE = 500;

// Przelicznik impulsu na HP obrazen.
// Zakres: [0.0001 bardzo odporne … 0.0008 normalne … 0.003 bardzo kruche]
export const DAMAGE_PER_IMPULSE = 0.0002;

// ── Launch pad pulse (żółte platformy) ───────────────────────────
// Po kontakcie platforma czeka LAUNCH_PAD_CONTACT_DELAY, podnosi się o
// LAUNCH_PAD_STROKE w czasie LAUNCH_PAD_RISE_TIME, opada i ładuje się przez
// LAUNCH_PAD_RELOAD_TIME. Impuls wynika z jej ruchu (I = m * v).
export const LAUNCH_PAD_CONTACT_DELAY = 0.015;   // 15 ms
export const LAUNCH_PAD_STROKE = 0.01;          // 0.01 m
export const LAUNCH_PAD_RISE_TIME = 0.03;       // 30 ms
export const LAUNCH_PAD_RELOAD_TIME = 1.0;      // 1 s
export const LAUNCH_PAD_EFFECTIVE_MASS = 4;   // kg

// ── Dopalaacz (Shift) ─────────────────────────────────────────────
// Czas [s] pełnego zbiornika dopalacza. Po wyczerpaniu trzeba odczekać na naładowanie.
// Zakres: [2 krótki … 4 normalne … 8 długi]
export const BOOST_DURATION      = 3.0;

// Mnożnik siły silnika podczas dopalacza (1.0 = brak efektu, 2.0 = podwójna siła).
// Zakres: [1.2 … 1.65 normalne … 2.5 ekstremalny]
export const BOOST_MULTIPLIER    = 4.5;

// Prędkość ładowania zbiornika [1/s]. 0.20 = pełne naładowanie w 5s.
// Zakres: [0.10 wolne … 0.20 normalne … 0.50 szybkie]
export const BOOST_RECHARGE_RATE = 0.20;

// FOV kamery w stanie normalnym i podczas dopalacza.
export const BOOST_FOV_NORMAL    = 80;
export const BOOST_FOV_ACTIVE    = 120;

// Szybkość lerpu FOV (wyższe = szybsza zmiana).
// Zakres: [0.03 … 0.08 normalne … 0.20]
export const BOOST_FOV_LERP      = 0.1;

// Szybkość narastania/opadania mnożnika boosta [1/s].
// 0.5 = pełne narastanie w 2s, 2.0 = w 0.5s
export const BOOST_RAMP_RATE     = 0.8;

// O ile metrów kamera opada podczas boosta [m].
export const BOOST_CAMERA_DIP    = 1.0;

// O ile metrów kamera oddala się podczas boosta [m].
// 0 = brak oddalenia, dodatnie wartości dają efekt "odjazdu" kamery przy przyspieszaniu.
export const BOOST_CAMERA_PULLBACK = 2.0;

// Opór powietrza — siła hamująca proporcjonalna do v².
// F_drag = AIR_DRAG * v²  [N/(m/s)²]
// Przy 30 m/s (~108 km/h): F = 15 * 900 = 13500 N (wyraźny efekt)
// Przy 10 m/s (~36 km/h):  F = 15 * 100 = 1500 N (ledwo wyczuwalny)
// Zakres: [3 słaby … 15 normalne … 40 bardzo agresywny]
export const AIR_DRAG = 0.3;

// ── Kamera ────────────────────────────────────────────────────────
// Odleglosc kamery za autem [m].
// Zakres: [5 bliskie … 10 normalne … 20 dalekie]
export const CAMERA_OFFSET_BEHIND = 6;

// Wysokosc kamery nad autem [m].
// Zakres: [2 nisko … 4 normalne … 8 z gory]
export const CAMERA_OFFSET_UP = 2;

// Szybkosc lerpu obrotu kamery za autem (yaw). Nizsze = kamera bardziej "leniwa".
// Zakres: [0.01 bardzo leniwa … 0.04 normalna … 0.15 natychmiastowa]
export const CAMERA_YAW_LERP = 0.12;

// Szybkosc lerpu pozycji kamery za autem. Nizsze = camera lag (kinowy efekt).
// Zakres: [0.02 duzy lag … 0.06 normalna … 0.2 natychmiastowa]
export const CAMERA_POS_LERP = 0.25;

// Szybkosc lerpu kierunku ruchu (horągiewka) — jak szybko kamera podąża za wektorem prędkości.
// Nizsze = bardziej leniwa, wyższe = natychmiastowe śledzenie.
// Zakres: [0.04 … 0.08 normalne … 0.18]
export const CAMERA_DIR_LERP = 0.10;

// Szybkosc lerpu kamery przy cofaniu (zwykle wolniejszy obrot niz do przodu).
// Zakres: [0.01 … 0.03 normalne … 0.1]
export const CAMERA_REVERSE_LERP = 0.015;

// Szybkość lerpu kamery gdy auto jest w powietrzu — znacznie wolniejszy,
// żeby kamera nie szalała przy obrocie bryły podczas lotu.
export const CAMERA_YAW_LERP_AIR  = 0.048;
export const CAMERA_POS_LERP_AIR  = 0.20;
