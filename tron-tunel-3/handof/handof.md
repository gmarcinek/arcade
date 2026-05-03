Poniżej handover w formie dokumentu dla dwóch agentów: **Orchestrator** planuje i dzieli pracę, **Executor** implementuje zmiany w kodzie.

---

# HANDOVER — TRON-BALL / proceduralny tunel, rozgałęzienia, safe track, zewnętrzne rury i rozkładane powierzchnie

## 0. Stan obecny projektu

Projekt jest obecnie grą typu tunnel runner / ball racer. Gracz steruje kulą jadącą po wewnętrznej powierzchni tunelu. Obecna implementacja zakłada jeden prosty tunel po osi `Z`.

Najważniejsze ograniczenie obecnej wersji: świat gry jest oparty o układ:

```txt
carZ      — pozycja wzdłuż tunelu
carTheta  — pozycja kątowa na okręgu tunelu
```

W `ball.js` pozycja kuli jest liczona z `TUNNEL_R`, `carTheta`, `carZ` oraz lokalnej bazy, gdzie `forward` jest stale `(0, 0, 1)`. To oznacza, że obecny model nie obsługuje jeszcze prawdziwych krzywych tuneli w 3D.

Kamera również zakłada prosty tunel po osi `Z`, bo jej pozycja zależy od `state.carZ`, a patrzenie odbywa się w kierunku `state.carZ + 20`.

Tunel jest obecnie jednym cylindrem:

```js
new THREE.CylinderGeometry(TUNNEL_R, TUNNEL_R, TUNNEL_LEN, 80, 48, true);
```

a safe zone jest tylko symetrycznym łukiem wyliczanym przez `getArcHalfAngle(z)`.

W `main.js` sprawdzenie danger zone też używa symetrycznego łuku wokół `theta = 0`:

```js
if (Math.abs(tNorm) > arcH)
```

czyli nie ma jeszcze osobnej ścieżki, która może wić się po ścianie, rozgałęziać, przerywać ani przechodzić na zewnętrzną powierzchnię.

Fizyka posiada już skok, radial offset, radial velocity, bounce i cooldown, ale landing logic jest jeszcze placeholderem. `evaluateLanding()` tylko ustawia `state.grounded = true`, bez sprawdzania, czy gracz faktycznie ląduje na legalnym safe tracku.

---

# 1. Wizja docelowa

Gra ma przestać być „kulą w jednym cylindrze”, a stać się proceduralnym systemem powierzchni jazdy.

Świat składa się z dwóch niezależnych warstw:

```txt
1. Linia / graf tuneli
   Przestrzenna struktura rur, odnóg, rozgałęzień, pęknięć, przejść i łączeń.

2. Linia / linie safe tracków
   Faktyczna jezdna ścieżka na powierzchni tych rur, czasem przerywana urwiskami, gapami i landing zone’ami.
```

Dodatkowo dochodzi trzecia kluczowa idea:

```txt
3. Transformacje powierzchni
   Tunel może pękać, rozkładać się, przechodzić z jazdy wewnątrz rury na jazdę po zewnętrzu, rozwijać się w arkusz, potem zwijać z powrotem.
```

Czyli powierzchnia jazdy może być:

```txt
- wewnętrzem rury,
- zewnętrzem rury,
- rozciętą skorupą rury,
- rozwiniętym arkuszem,
- spiralnym przejściem między wnętrzem i zewnętrzem,
- fragmentem pękniętej skorupy,
- pomostem między dwiema rurami,
- landing zone po przeskoku.
```

---

# 2. Najważniejsza zmiana mentalna

Nie projektować już gry jako:

```txt
Z + theta na jednym cylindrze
```

Tylko jako:

```txt
activeSurfaceId + s + u
```

Gdzie:

```txt
s — pozycja wzdłuż aktualnego segmentu / powierzchni
u — pozycja poprzeczna po powierzchni
```

Dla rury `u` może odpowiadać kątowi `theta`.

Dla arkusza `u` jest pozycją lewo-prawo na płaskiej lub lekko zagiętej powierzchni.

Dla pękniętej skorupy `u` jest pozycją na fragmencie łuku, który nie obejmuje pełnego obwodu.

Dla zewnętrza rury `u` nadal może być kątem, ale normalna powierzchni i interpretacja grawitacji/kolizji są inne.

---

# 3. Docelowy model danych

## 3.1. TrackWorld

Główny kontener świata.

```ts
type TrackWorld = {
  seed: number;
  surfaces: SurfaceSegment[];
  graph: SurfaceGraph;
  goldenPath: PathSample[];
  activeWindow: {
    fromS: number;
    toS: number;
  };
};
```

## 3.2. SurfaceSegment

Jeden jezdny lub wizualny segment świata.

```ts
type SurfaceSegment = {
  id: string;
  kind:
    | "tube-inner"
    | "tube-outer"
    | "cracked-tube"
    | "unrolled-sheet"
    | "folding-sheet"
    | "branch-junction"
    | "gap"
    | "connector";

  centerline: Curve3D;
  length: number;

  radius?: number;
  width?: number;

  transformProfile?: SurfaceTransformProfile;

  safeTracks: SafeTrack[];

  exits: SurfaceExit[];
  entries: SurfaceEntry[];

  visual: SurfaceVisualConfig;
  gameplay: SurfaceGameplayConfig;
};
```

## 3.3. SafeTrack

Safe track jest osobny od rury. To nie jest cała powierzchnia. To jezdna linia lub pas.

```ts
type SafeTrack = {
  id: string;
  surfaceId: string;

  samples: SafeTrackSample[];

  widthProfile: WidthProfile;

  gaps: GapZone[];
  landingZones: LandingZone[];

  difficulty: number;

  tags: Array<
    "main" | "shortcut" | "risky" | "branch-entry" | "landing" | "recovery"
  >;
};
```

Sample safe tracku:

```ts
type SafeTrackSample = {
  s: number;
  u: number;
  width: number;
};
```

## 3.4. GapZone

```ts
type GapZone = {
  fromS: number;
  toS: number;
  requiredJump: boolean;
  minSpeed?: number;
  landingZoneId: string;
};
```

## 3.5. SurfaceTransformProfile

Opis przejścia rury w inny stan.

```ts
type SurfaceTransformProfile = {
  mode:
    | "none"
    | "inside-to-outside"
    | "outside-to-inside"
    | "crack-open"
    | "tube-to-sheet"
    | "sheet-to-tube"
    | "split-shell";

  fromS: number;
  toS: number;

  crackAngle?: number;
  openingAmount?: number;
  twist?: number;
  roll?: number;
};
```

Przykład:

```txt
tube-inner → crack-open → tube-outer
```

Albo:

```txt
tube-inner → tube-to-sheet → unrolled-sheet → sheet-to-tube → tube-inner
```

---

# 4. Podział na systemy

## 4.1. TunnelGraphGenerator

Odpowiada za przestrzenne linie tuneli.

Nie generuje jeszcze mesha. Generuje abstrakcyjny graf:

```txt
rura A
  odcinek prosty
  zakręt
  split na B i C
  merge z D
```

Na tym poziomie pracujemy z krzywymi 3D, np. CatmullRomCurve3 albo własny wrapper.

Output:

```ts
type TunnelGraph = {
  nodes: TunnelNode[];
  edges: TunnelEdge[];
};
```

## 4.2. SurfaceGenerator

Bierze `TunnelGraph` i zamienia jego edge’e na powierzchnie:

```txt
edge tunelu → tube-inner
edge z pęknięciem → cracked-tube
edge po zewnętrzu → tube-outer
edge rozłożony → unrolled-sheet
```

## 4.3. SafeTrackGenerator

Generuje ścieżki na powierzchniach.

To jest główny generator gameplayu.

Powinien produkować:

```txt
- szerokie intro,
- wąską ścieżkę,
- S-turn po ścianie,
- przejście na zewnątrz rury,
- skok przez pęknięcie,
- lądowanie na zewnętrznej skorupie,
- rozjazd na dwie odnogi,
- risky shortcut,
- bezpieczną dłuższą trasę.
```

## 4.4. GameplayValidator

To bardzo ważne.

Po wygenerowaniu ścieżki trzeba sprawdzić, czy golden path jest grywalny.

Walidator ma sprawdzać:

```txt
- czy zakręt nie przekracza maksymalnej sterowności,
- czy zwężenie nie jest absurdalnie wąskie,
- czy przed skokiem jest wystarczający najazd,
- czy po skoku istnieje landing zone,
- czy branch decision jest widoczny wystarczająco wcześnie,
- czy przejście inside/outside nie robi nagłej zmiany normalnej,
- czy kamera będzie miała sensowny follow.
```

## 4.5. SurfacePhysics

Nowa fizyka musi działać po powierzchni, nie po globalnym `Z`.

Stan gracza docelowo:

```ts
type PlayerSurfaceState = {
  activeSurfaceId: string;
  s: number;
  u: number;

  sVelocity: number;
  uVelocity: number;

  radialOffset: number;
  radialVelocity: number;

  grounded: boolean;

  currentSafeTrackId?: string;
  committedBranchId?: string;
};
```

## 4.6. SurfaceRenderer

Renderer buduje meshe z danych powierzchni.

Pierwsza wersja może być prosta:

```txt
tube-inner      — TubeGeometry-like mesh
tube-outer      — podobna rura, ale normalna/strona odwrotna
cracked-tube    — niepełna rura, tylko łuk powierzchni
unrolled-sheet  — prostokątny ribbon / plane
folding-sheet   — interpolacja między łukiem a płaskim arkuszem
branch-junction — na początku maskowane portale, nie idealna topologia
```

---

# 5. Fazy implementacji

## Milestone 1 — abstrakcyjny model bez ingerencji w starą grę

Cel: dodać nowy generator obok starego kodu, bez psucia obecnej gry.

Nowe pliki:

```txt
/js/procedural/math.js
/js/procedural/curves.js
/js/procedural/surfaceTypes.js
/js/procedural/trackWorld.js
/js/procedural/generators/tunnelGraphGenerator.js
/js/procedural/generators/surfaceGenerator.js
/js/procedural/generators/safeTrackGenerator.js
/js/procedural/validators/gameplayValidator.js
```

Nie ruszać jeszcze `physics.js`, `camera.js`, `ball.js`.

Efekt: można wygenerować `TrackWorld` i wypisać go w konsoli.

---

## Milestone 2 — debug renderer

Cel: zobaczyć wygenerowaną strukturę.

Nowy plik:

```txt
/js/procedural/debugTrackRenderer.js
```

Renderować:

```txt
biała linia        — centerline tunelu
pomarańczowa linia — golden path
niebieska wstęga   — safe track
czerwone odcinki    — gapy
zielone ringi       — branch gates
fioletowe odcinki   — inside/outside/sheet transitions
```

Nie trzeba jeszcze grać. To ma być mapa diagnostyczna.

---

## Milestone 3 — jeden krzywy tunel 3D

Cel: zastąpić prosty `carZ` jednym krzywym segmentem.

Na tym etapie jeszcze bez rozgałęzień.

Wymagane:

```txt
- SurfaceSegment kind: tube-inner
- centerline3D
- frameAt(s)
- worldPositionAt(s, u, radialOffset)
- worldNormalAt(s, u)
- worldForwardAt(s)
```

W tym miejscu trzeba zacząć odchodzić od założenia, że `forward` to zawsze `(0,0,1)`. W obecnym `ball.js` forward jest stały, więc Executor musi przygotować nową funkcję basisu opartą o aktualną powierzchnię.

---

## Milestone 4 — safe track na krzywym tunelu

Cel: gracz jedzie po krzywym tunelu, a safe track wije się po jego powierzchni.

Zastąpić:

```js
getArcHalfAngle(z);
```

modelem:

```ts
getSafeInfo(surfaceId, s, u);
```

który zwraca:

```ts
{
  onSafeTrack: boolean;
  nearestTrackId?: string;
  distanceToCenter: number;
  width: number;
  dangerLevel: number;
}
```

W `main.js` nie sprawdzać już:

```js
Math.abs(tNorm) > arcH;
```

tylko:

```ts
const safe = trackWorld.querySafe(state.activeSurfaceId, state.s, state.u);
if (!safe.onSafeTrack) dangerTimer += dt;
```

Obecna symetryczna logika danger zone w `main.js` jest do zastąpienia.

---

## Milestone 5 — gapy i landing zone

Cel: safe track może się urwać.

Zasada:

```txt
Jeżeli gracz jest grounded i wjeżdża w gap:
  grounded = false
  radialVelocity zaczyna działać jak spadanie / oderwanie od powierzchni

Jeżeli gracz wraca do powierzchni:
  landing jest poprawny tylko wtedy, gdy aktualne s/u trafia w landing zone
```

Wymagane zmiany w `physics.js`:

Obecne:

```js
function evaluateLanding() {
  state.grounded = true;
}
```

Docelowo:

```ts
function evaluateLanding(surfaceQuery) {
  if (surfaceQuery.canLand) {
    state.grounded = true;
    state.currentSafeTrackId = surfaceQuery.trackId;
  } else {
    crashOrFall();
  }
}
```

To jest jeden z głównych punktów przebudowy fizyki.

---

## Milestone 6 — inside → outside

Cel: pierwszy efekt przeflancowania.

Przykład gameplayowy:

```txt
Gracz jedzie wewnątrz rury.
Rura zaczyna pękać.
Safe track prowadzi do szczeliny.
Kula przeskakuje / przechodzi przez rozcięcie.
Po krótkim transition segment znajduje się na zewnętrznej powierzchni rury.
Kamera obraca referencję up/normal, ale bez nagłego skoku.
```

Technicznie to nie musi być na początku prawdziwe przejście przez dziurę w meshu.

Pierwsza implementacja może być „oszukana”:

```txt
segment A: tube-inner
connector: crack-portal
segment B: tube-outer
```

W przejściu interpolujemy:

```txt
surface normal
camera up
player basis
visual glow
```

Najważniejsze: stan gracza zostaje na powierzchni i przechodzi z jednego `SurfaceSegment` do drugiego.

---

## Milestone 7 — rura rozkłada się w arkusz

Cel: segment typu `tube-to-sheet`.

Parametryzacja:

```txt
s — wzdłuż trasy
u — po szerokości / po obwodzie
```

Transformacja powierzchni:

```txt
t = progress from 0..1

t = 0   pełna rura
t = 0.5 pęknięta, otwierająca się skorupa
t = 1   arkusz / droga
```

Geometria może być liczona przez interpolację:

```txt
tube position(u) → sheet position(u)
```

Safe track może płynnie przechodzić z `theta` na `u`.

To daje sekcje typu:

```txt
rura pęka
ściana rozwija się jak neonowy arkusz
jedzie się po płaskiej / falującej drodze
arkusz zwija się znowu w rurę
```

---

## Milestone 8 — rozgałęzienia i decyzje

Cel: prawdziwa decyzyjność.

Branch powinien mieć strefy:

```txt
approach zone
decision gate
commit zone
cut zone
```

Logika:

```txt
Jeżeli gracz w decision gate znajduje się w zakresie wejścia do odnogi A:
  activeSurfaceId = A

Jeżeli w zakresie odnogi B:
  activeSurfaceId = B

Jeżeli nie trafił w żadną:
  crash / danger / fall

Nieobrane odnogi mogą dalej istnieć wizualnie, ale są odcięte gameplayowo.
```

Nie zaczynać od idealnych Y-junction meshów. Na początku rozgałęzienie może być zrobione portalem / maską / bloomem.

---

## Milestone 9 — proceduralne patterny

Dopiero po działającym systemie bazowym dodać wzorce.

Przykładowe patterny:

```txt
wide-intro
narrow-snake
inside-to-outside-crack
outside-wall-run
tube-to-sheet
sheet-gap
sheet-to-tube
branch-choice-easy
branch-choice-risky-shortcut
split-safe-tracks
merge-after-choice
jump-into-branch
fake-branch
recovery-zone
```

Każdy pattern ma mieć kontrakt:

```ts
type PatternContract = {
  input: {
    s: number;
    u: number;
    speedRange: [number, number];
    difficulty: number;
  };

  output: {
    s: number;
    u: number;
    preferredSpeed: number;
  };

  constraints: {
    minLength: number;
    maxCurvature: number;
    minWidth: number;
    requiresJump?: boolean;
    requiresBranchChoice?: boolean;
  };
};
```

---

# 6. Rekomendowana kolejność prac dla Orchestratora

Orchestrator nie powinien zlecać od razu finalnego renderowania rozgałęzionych tuneli.

Kolejność:

```txt
1. Dodać abstrakcyjny model SurfaceSegment / SafeTrack / TrackWorld.
2. Dodać prosty seeded generator.
3. Dodać debug renderer.
4. Zrobić jeden krzywy tube-inner.
5. Przepiąć player state z carZ/carTheta na surfaceId/s/u.
6. Przepiąć kamerę na surface frame.
7. Przepiąć safe zone na SafeTrackQuery.
8. Dodać gapy.
9. Dodać inside/outside transition.
10. Dodać tube-to-sheet/sheet-to-tube.
11. Dodać branch decision.
12. Dopiero potem poprawiać finalne meshe i junctiony.
```

---

# 7. Zasady dla Executora

Executor ma pracować etapami i nie robić jednego wielkiego commita.

## Reguła 1

Nie usuwać starego systemu od razu.

Stary kod zostaje jako fallback:

```txt
legacy tunnel mode
```

Nowy kod powstaje jako:

```txt
procedural surface mode
```

## Reguła 2

Każdy etap musi mieć widoczny efekt diagnostyczny.

Nie implementować ukrytej architektury bez debug view.

## Reguła 3

Nie robić finalnego Y-junction mesha przed działającym wyborem odnogi.

Najpierw gameplay, potem geometria.

## Reguła 4

Nie robić dziur w meshach jako pierwszej wersji gapów.

Najpierw gap jako logika safe tracku:

```txt
support = false
```

Dopiero potem wizualna dziura.

## Reguła 5

Każda powierzchnia musi umieć odpowiedzieć na cztery pytania:

```ts
getPoint(s, u, radialOffset);
getNormal(s, u);
getTangent(s);
getFrame(s, u);
```

Bez tego kamera, fizyka i kula będą się rozjeżdżały.

---

# 8. Minimalny interfejs nowego systemu

Executor powinien najpierw przygotować takie API:

```ts
type SurfaceFrame = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
};

type SurfaceQuery = {
  surfaceId: string;
  s: number;
  u: number;

  position: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;

  onSafeTrack: boolean;
  canLand: boolean;
  inGap: boolean;
  dangerLevel: number;

  nearestTrackId?: string;
  distanceToSafeCenter?: number;
};
```

Główne funkcje:

```ts
trackWorld.getFrame(surfaceId, s, u, radialOffset);
trackWorld.query(surfaceId, s, u);
trackWorld.advanceSurface(surfaceId, s, ds);
trackWorld.resolveBranch(surfaceId, s, u);
```

---

# 9. Jak mapować starą fizykę na nowy system

Stare:

```txt
carZ
carTheta
thetaVelocity
radialOffset
radialVelocity
```

Nowe:

```txt
s
u
uVelocity
radialOffset
radialVelocity
```

Mapowanie:

```txt
carZ           → s
carTheta       → u
thetaVelocity  → uVelocity
speed          → sVelocity
```

Na rurze:

```txt
u = theta
```

Na arkuszu:

```txt
u = lateral position
```

Na pękniętej rurze:

```txt
u = angle inside limited arc
```

---

# 10. Kamera w nowym systemie

Kamera nie może już używać globalnego `Z`.

Obecnie patrzy na `state.carZ + 20`, co działa tylko dla prostego tunelu.

Docelowo kamera bierze:

```txt
playerFrame.position
playerFrame.forward
playerFrame.up
playerFrame.normal
```

Pozycja kamery:

```txt
camera.position =
  player.position
  - player.forward * backDistance
  + player.normal * cameraHeight
```

Look target:

```txt
lookAt =
  player.position
  + player.forward * lookAhead
```

Dla inside/outside transition kamera musi mieć smoothing normalnej, inaczej będzie szarpać.

---

# 11. Renderer powierzchni

## Tube inner

Rura wewnętrzna:

```txt
normal skierowana do środka jazdy / zgodnie z aktualnym modelem kolizji
side: BackSide albo odpowiednio odwrócone normalne
```

## Tube outer

Rura zewnętrzna:

```txt
normal na zewnątrz
side: FrontSide
```

## Cracked tube

Niepełny łuk rury:

```txt
uMin/uMax ograniczają fragment skorupy
```

## Unrolled sheet

Prosty lub lekko wygięty ribbon:

```txt
s — długość
u — szerokość
```

## Folding sheet

Interpolacja między rurą i arkuszem:

```txt
position = mix(tubePosition, sheetPosition, foldT)
```

---

# 12. Wizualne zasady dla TRON-BALL

Styl ma pozostać neonowy, cybernetyczny, z mocnym pomarańczowym bloomem i ciemną bazą.

Safe track powinien być czytelniejszy niż dekoracyjna siatka.

Priorytet czytelności:

```txt
1. krawędzie safe tracku
2. gap / brak podłoża
3. branch gate
4. landing zone
5. dekoracyjne tile/grid/lava efekty
```

Przy rozgałęzieniach:

- aktywna możliwa odnogi powinny mieć mocniejszy rim glow,
- nieobrane mogą gasnąć albo odjeżdżać w mrok,
- cut nie musi oznaczać natychmiastowego usunięcia mesha.

---

# 13. Ryzyka techniczne

## Ryzyko 1 — zbyt wczesne robienie meshy

Największy błąd: zacząć od idealnych pękających rur i Y-junctionów.

Najpierw dane, debug, gameplay. Mesh później.

## Ryzyko 2 — mieszanie geometrii z gameplayem

Safe track nie może być tylko shaderem. Musi istnieć jako dane, bo fizyka i landing muszą pytać o legalną powierzchnię.

## Ryzyko 3 — nagła zmiana normalnej

Inside/outside i tube/sheet transitions muszą mieć smoothing frame’u. Inaczej kamera i kula będą się obracały nienaturalnie.

## Ryzyko 4 — proceduralne trasy niegrywalne

Każdy generator musi mieć walidator golden path.

## Ryzyko 5 — stary kod zakłada globalne `Z`

Dotyczy szczególnie:

- `ball.js`,
- `camera.js`,
- `main.js`,
- `physics.js`.

Te pliki trzeba przepinać ostrożnie.

---

# 14. Pierwszy realny task dla Executora

Nie zaczynać od wielkiej przebudowy.

Pierwszy task:

```txt
Dodaj nowy moduł proceduralny, który generuje jeden SurfaceSegment typu tube-inner z krzywą centerline 3D oraz jeden SafeTrack wijący się po tej rurze. Dodaj debug renderer pokazujący centerline i safe track jako linie w scenie. Nie zmieniaj jeszcze fizyki gry.
```

Pliki do dodania:

```txt
/js/procedural/trackWorld.js
/js/procedural/surfaceSegment.js
/js/procedural/safeTrack.js
/js/procedural/generateDemoTrack.js
/js/procedural/debugTrackRenderer.js
```

Acceptance criteria:

```txt
- po starcie gry w scenie widać debugową linię krzywego tunelu,
- widać osobną linię safe tracku na tej powierzchni,
- generator jest seedowany,
- kod nie psuje obecnego prostego tunelu,
- dane safe tracku istnieją jako JS object, nie tylko shader.
```

---

# 15. Drugi task dla Executora

```txt
Dodaj funkcję getFrame(surfaceId, s, u), która zwraca position, forward, right, up/normal dla punktu na wygenerowanej powierzchni.
```

Acceptance criteria:

```txt
- można wstawić testową kulę debugową na kilku punktach safe tracku,
- kule leżą na powierzchni,
- orientacja lokalnej bazy jest stabilna,
- nie ma nagłych flipów frame’u.
```

---

# 16. Trzeci task dla Executora

```txt
Dodaj eksperymentalny tryb proceduralPlayerMode, w którym kula używa s/u zamiast carZ/carTheta na jednym krzywym tube-inner.
```

Acceptance criteria:

```txt
- gracz porusza się po krzywym tunelu,
- kamera idzie za lokalnym forwardem,
- sterowanie lewo/prawo zmienia u,
- speed zmienia s,
- stary tryb nadal działa po wyłączeniu flagi.
```

---

# 17. Definicja sukcesu całego refaktoru

Docelowo system jest poprawny, gdy można wygenerować trasę typu:

```txt
Gracz startuje wewnątrz rury.
Safe track idzie po dolnej części tunelu.
Tunel skręca w 3D.
Ścieżka zwęża się i wchodzi na boczną ścianę.
Rura zaczyna pękać.
Safe track prowadzi przez rozcietą i wypłaszczającą się rurę na zewnętrze rury, kształt po rozcieciu rury na arkusz który wywinięto na nice.
Gracz jedzie po zewnętrznej powierzchni.
Rura rozkłada się w arkusz.
Na arkuszu pojawia się gap.
Gracz przeskakuje gap i ląduje na landing zone.
Arkusz zwija się z powrotem w rurę albo halfpipe
Tunel rozgałęzia się.
Gracz wybiera jedną odnogę.
Nieobrana odnoga zostaje odcięta gameplayowo. i wychodzi z renderu i pamieci
```

To jest target systemu.

Nie trzeba tego robić naraz. Ale wszystkie nowe abstrakcje powinny prowadzić dokładnie w tę stronę.
