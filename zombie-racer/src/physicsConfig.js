// ═══════════════════════════════════════════════════════════════════
//  PHYSICS CONFIG — wszystkie parametry fizyczne w jednym miejscu
//  Kazda wartosc ma opis efektu i sensowny zakres [min … max]
// ═══════════════════════════════════════════════════════════════════

// ── Swiat ──────────────────────────────────────────────────────────
// Sila grawitacji. Wyzsze odczucia ciezkosci, szybsze ladowanie po skoku.
// Zakres: [-9.8 ziemska … -30 bardzo ciezkie]
export const GRAVITY = -9.8;

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
export const CHASSIS_COM_OFFSET_Y = 0.50;

// Przesuniecie srodka masy w przod/tyl [m].
// Ujemne (przod) = understeer (auto jedzie prosto, trudniej skrecic).
// Dodatnie (tyl) = oversteer (tyl wyslizguje sie w zakretech).
// Zakres: [-0.5 … 0.5]  (zwykle 0)
// Kodiaq FWD: nieznacznie przesuniete do przodu (lekki understeer)
export const CHASSIS_COM_OFFSET_Z = -0.08;

// Tlumienie obrotu nadwozia. Zapobiega kreceniu sie w miejscu po zderzeniu.
// Wyzsze = auto szybciej przestaje sie krecic, mniej "pinball".
// Zakres: [0.1 brak tlumienia … 0.9 normalne … 1.0 natychmiastowe zatrzymanie obrotu]
// Kodiaq: realistyczne tlumienie — auto moze sie krecic po wywrotce
export const ANGULAR_DAMPING = 0.35;

// Tlumienie predkosci liniowej (opor powietrza + toczenia).
// Wyzsze = auto samo zwalnia szybciej gdy puszczasz gaz.
// Zakres: [0.01 slizga sie jak lod … 0.1 normalne … 0.5 bardzo duze tlumienie]
// Kodiaq: Cx=0.36, przy G=-9.8 niskie liniowe tlumienie jest realistyczne
export const LINEAR_DAMPING = 0.03;

// ── Silnik / sterowanie ────────────────────────────────────────────
// Maksymalna sila silnika na kolo napedowe [N].
// Wyzsze = szybsze przyspieszenie i wyzsza predkosc max.
// Zakres: [2000 slabe … 5000 normalne … 10000 wyscigowe]
// Kodiaq 2.0 TSI 140kW: 0-100 ~7.5s → F=1750*3.7=6475N łącznie / 2 kola FWD
export const MAX_ENGINE_FORCE = 6500;

// Maksymalny kat skretu kol przednich [rad].
// Wyzsze = ostrzejsze skrety, ale tez latwiej wpasc w poslizg.
// Zakres: [0.3 mala skretnosc … 0.5 normalna … 0.8 bardzo skretne]
// Kodiaq: promien skretu 11.1m, rozstaw 2.79m → kat ~0.26rad, z zapasem ~0.45
export const MAX_STEER = 0.45;

// Sila hamulcow na kazde kolo [N*m].
// Wyzsze = krotszy dystans hamowania. Za wysokie = natychmiastowe blokowanie kol.
// Zakres: [20 slabe … 60 normalne … 150 wyscigowe]
// Kodiaq: opoznienie hamowania ~9.5 m/s2 → F=1750*9.5/4=4156N/kolo, w sim ~80
export const BRAKE_FORCE = 80;

// ── Kola — geometria ──────────────────────────────────────────────
// Promien kola [m]. Wplywa na predkosc obrotowa i przesit.
// Zakres: [0.3 male … 0.55 normalne … 0.8 monster truck]
// Kodiaq: opona 235/55R17 → r = (17*25.4/2 + 235*0.55) / 1000 = 0.345m
export const WHEEL_RADIUS = 0.345;

// Odleglosc kola od osi symetrii auta (pulos) [m].
// Szerzej = stabilniejsze w zakretech, wezej = bardziej zwrotne.
// Zakres: [0.8 … 1.15 normalne … 1.5]
// Kodiaq: tor przedni 1598mm / 2 = 799mm = 0.80m
export const WHEEL_POS_X = 0.80;

// Odleglosc przednich kol od srodka auta [m] (rozstaw osi przod).
// Zakres: [1.2 … 1.85 normalne … 2.5]
// Kodiaq: rozstaw osi 2791mm / 2 = 1396mm = 1.40m
export const WHEEL_POS_Z_FRONT = 1.40;

// Odleglosc tylnych kol od srodka auta [m] (rozstaw osi tyl).
// Zakres: [1.2 … 1.85 normalne … 2.5]
export const WHEEL_POS_Z_REAR = 1.40;

// ── Zawieszenie ────────────────────────────────────────────────────
// Sztywnosc sprezyny zawieszenia [N/m].
// Nizsze = miekkie (duze bujanie, dobra absorpcja), wyzsze = twarde (stabilne, malo ugiecia).
// Zakres: [10 bardzo miekkie … 22 normalne … 50 twarde sportowe]
// Kodiaq: komfortowe zawieszenie, z G=-9.8 potrzeba wyzszej wartosci niz z G=-20
export const SUSPENSION_STIFFNESS = 35;

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

// Przyczepnosc przednich kol przy wysokiej predkosci (przy pelnym poslizgu).
// Zakres: [1.0 … FRICTION_SLIP_FRONT_STATIC]
export const FRICTION_SLIP_FRONT_DYNAMIC = 2.4;

// Przyczepnosc tylnych kol przy wysokiej predkosci.
// Nizsze niz przod = oversteer przy duzych predkosciach.
// Zakres: [1.0 … FRICTION_SLIP_REAR_STATIC]
export const FRICTION_SLIP_REAR_DYNAMIC = 1.8;

// Predkosc [m/s] od ktorej zaczyna sie tracic przyczepnosc dynamicznie.
// (~54 km/h przy 15, ~79 km/h przy 22)
// Zakres: [8 … 22 normalne … 35]
// Kodiaq: letnie opony, poślizg od ~60 km/h
export const SLIP_SPEED_MIN = 17;

// Predkosc [m/s] przy ktorej osiagamy pelny poslizg dynamiczny.
// Zakres: [SLIP_SPEED_MIN+4 … 28 normalne … 50]
export const SLIP_SPEED_MAX = 38;

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
export const FRICTION_GRASS = 0.4;

// Asfalt — lepsza przyczepnosc niz trawa (2x). Drogi i chodniki.
// Im wieksza roznica miedzy GRASS a ASPHALT, tym silniejszy "snap" przy przejezdzie podczas poslizgu.
// Zakres: [0.7 mokry … 1.0 suchy … 1.3 racing tarmac]
// Realistyczne: suchy asfalt μ ≈ 0.7-0.9
export const FRICTION_ASPHALT = 0.8;

// Kaluz / piasek — niska przyczepnosc (0.4x). Trudny teren.
// Zakres: [0.05 lod … 0.2 kaluz/piasek … 0.4 zwir]
// Realistyczne: mokra nawierzchnia μ ≈ 0.15-0.25
export const FRICTION_SLICK = 0.18;

// ── Zderzenia — obrazenia ─────────────────────────────────────────
// Predkosc [m/s] ponizej ktorej zderzak calkowicie pochlania uderzenie (brak obrazen).
// (~18 km/h przy 5). Wyzsze = auto bardziej odporne na drobne stluczki.
// Zakres: [2 bardzo czule … 5 normalne … 12 bardzo odporne]
export const BUMPER_SPEED_THRESHOLD = 5;

// Mnoznik sily przy uderzeniu w budynek/drzewo/bariere.
// damage_hp = (speed - threshold) * SCALE * DAMAGE_PER_IMPULSE * 100
// Przy SCALE=400, predkosci 10 m/s: (10-5)*400*0.0008*100 = 16 HP
// Zakres: [100 … 400 normalne … 1000 brutalne]
export const BUILDING_IMPACT_SCALE = 400;

// Mnoznik sily przy zderzeniu auto-auto.
// Zakres: [100 … 400 normalne … 1000 brutalne]
export const CAR_IMPACT_SCALE = 400;

// Przelicznik impulsu na HP obrazen.
// Zakres: [0.0001 bardzo odporne … 0.0008 normalne … 0.003 bardzo kruche]
export const DAMAGE_PER_IMPULSE = 0.0008;

// ── Kamera ────────────────────────────────────────────────────────
// Odleglosc kamery za autem [m].
// Zakres: [5 bliskie … 10 normalne … 20 dalekie]
export const CAMERA_OFFSET_BEHIND = 10;

// Wysokosc kamery nad autem [m].
// Zakres: [2 nisko … 4 normalne … 8 z gory]
export const CAMERA_OFFSET_UP = 4;

// Szybkosc lerpu obrotu kamery za autem (yaw). Nizsze = kamera bardziej "leniwa".
// Zakres: [0.01 bardzo leniwa … 0.04 normalna … 0.15 natychmiastowa]
export const CAMERA_YAW_LERP = 0.04;

// Szybkosc lerpu pozycji kamery za autem. Nizsze = camera lag (kinowy efekt).
// Zakres: [0.02 duzy lag … 0.06 normalna … 0.2 natychmiastowa]
export const CAMERA_POS_LERP = 0.06;

// Szybkosc lerpu kamery przy cofaniu (zwykle wolniejszy obrot niz do przodu).
// Zakres: [0.01 … 0.03 normalne … 0.1]
export const CAMERA_REVERSE_LERP = 0.03;
