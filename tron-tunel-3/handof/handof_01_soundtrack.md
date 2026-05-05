Poniżej handover w formie dokumentu dla dwóch agentów: **Orchestrator** planuje i dzieli pracę, **Executor** implementuje moduły audio i ich sprzężenie z shaderami i gameplayem.

---

# HANDOVER — TRON-BALL / systemowe audio jako dane, proceduralna muzyka na żywo, sprzężenie shaderów i gameplayu z dźwiękiem

## 0. Stan obecny projektu

W obecnej wersji TRON-BALL nie ma własnego systemu dźwiękowego. Gra jest cicha. Brakuje zarówno reaktywnej warstwy wizualnej powiązanej z dźwiękiem, jak i muzyki dynamicznej powiązanej z rozgrywką (prędkość, sterowanie, zakręty, gapy, decyzje przy rozgałęzieniu).

Równolegle trwa refaktor proceduralnego systemu powierzchni (TrackWorld, SurfaceSegment, SafeTrack — opisany w osobnym handoverze). Ten dokument **nie ingeruje** w tamten refaktor. Buduje warstwę audio jako niezależny moduł, który dopiero w kolejnych etapach łączy się z gameplayem i shaderami.

Cel niniejszego handoveru:

```txt
1. Zbudować pipeline który czyta systemowe / zewnętrzne audio
   i robi z niego strumień metadanych (beat, bas, tonacja, energia w pasmach).

2. Zbudować silnik proceduralnej muzyki na żywo,
   który gra dynamicznie w odpowiedzi na stan gry.

3. Połączyć oba światy ze shaderami i gameplayem
   przez wspólną magistralę metadanych (AudioMetadataBus).
```

Bardzo ważna zasada od początku:

```txt
Audio NIE jest streamowane na zewnątrz.
Audio jest analizowane lokalnie.
Na zewnątrz (do shaderów / gameplayu) wychodzą wyłącznie metadane —
liczby, eventy, wektory cech.
Te metadane sterują shaderami tunelu, tła, postprocessingiem
oraz reagującą warstwą gameplayową.
```

---

## 1. Wizja docelowa — dwie warstwy audio

System dźwiękowy gry składa się z dwóch niezależnych warstw, które łączą się przez wspólną magistralę:

```txt
A. AudioAnalysisLayer
   Wejście: systemowe / zewnętrzne audio (np. user puścił własną muzykę
   w drugim tabie, YT, Spotify desktop, ulubiony stream, wrzucony plik).
   Wyjście: strumień metadanych — beat, BPM, bas, mid, treble, chroma,
   onsety, energia, transienty, fazy taktu.

B. ProceduralMusicLayer
   Wejście: stan gry (prędkość, krzywizna, decyzje, skok, lądowanie,
   safe track / danger, transition inside/outside, branch pending).
   Wyjście: live generowana muzyka — warstwy loopów, frazy,
   syntezatory reagujące na input gracza.
```

Obie warstwy współdzielą:

```txt
- AudioMetadataBus     (wspólna magistrala metadanych)
- ShaderAudioBridge    (uniformy do shaderów)
- GameplayAudioBridge  (eventy do logiki gry)
```

Dzięki temu shadery tunelu pulsują tak samo czytelnie, czy gracz słucha własnego utworu, czy słucha tylko proceduralnej muzyki gry. To jeden, jednolity mechanizm.

---

## 2. Najważniejsza zmiana mentalna

Nie myśleć o tym jako „odtwarzacz” + „muzyczka tła”.

Myśleć o tym jako:

```txt
Audio to warstwa danych, dokładnie taka sama jak fizyka czy AI.
Każda klatka renderera dostaje świeży snapshot AudioMetadata,
tak samo jak dostaje delta time i stan gracza.
```

Dla shaderów to znaczy:

```glsl
uniform float uBeat;          // 0..1 obwiednia od ostatniego beatu (decay)
uniform float uBass;          // 0..1 wygładzona energia basowa
uniform float uMid;
uniform float uTreble;
uniform float uOnset;         // krótki impuls przy transiencie
uniform float uTempoPhase;    // 0..1 pozycja w aktualnym takcie
uniform vec3  uChroma;        // 12-elementowe chroma skompresowane do 3 osi
uniform float uMusicEnergy;   // łączna energia muzyczna 0..1
uniform float uSpectralCentroid; // jasność dźwięku
```

Dla gameplayu to znaczy:

```ts
audioBus.on("beat",          (e) => { ... });
audioBus.on("strongOnset",   (e) => { ... });
audioBus.on("phraseChange",  (e) => { ... });
audioBus.on("drop",          (e) => { ... });
```

Dla MusicEngine to znaczy:

```ts
musicEngine.update({
  speedNorm: 0.7,
  curvature: 0.4,
  surfaceKind: "tube-outer",
  airborne: false,
  dangerLevel: 0.3,
  branchPending: true,
});
```

Wszystko siedzi na tej samej magistrali. Wszystko jest danymi.

---

## 3. Architektura wysokopoziomowa

```txt
                    +-----------------------------+
                    |   SystemAudioCaptureLayer   |
                    |   (getDisplayMedia / mic /  |
                    |    plik audio)              |
                    +--------------+--------------+
                                   |
                                   v PCM (AudioWorklet)
                    +-----------------------------+
                    |   AudioAnalysisWorker       |
                    |   (FFT, onset, BPM, chroma) |
                    +--------------+--------------+
                                   |
                                   v AudioFeatures @ ~60Hz
+----------------+      +-----------------------------+      +---------------+
|  MusicEngine   |<-----|     AudioMetadataBus        |----->| ShaderBridge  |
|  (Tone.js /    |      |  (pub/sub, ring buffer,     |      | (uniformy +   |
|  custom synth) |      |   smoothed signals,         |      |  postprocess) |
+--------+-------+      |   beat events, fazy)        |      +-------+-------+
         |              +-------------+---------------+              |
         | own PCM                    |                              |
         | (przez                     v                              v
         |  output gain)        GameplayAudioBridge            uniforms
         |                  (eventy: beatTick, onsetHit,            |
         |                   phraseStart, drop)                     |
         |                            |                            |
         +--------> destination       v                            v
                                game logic (jump cues,        materials /
                                feedback, scoring, FX)         shaders
```

Najważniejsze: **AudioMetadataBus** jest jednym, scentralizowanym kanałem. Wszystko, co reaguje na audio (shadery, gameplay, MusicEngine, debug HUD), zaciąga z niego dane. Nie ma równoległych ścieżek „shader sobie sam liczy FFT z analyserNode”.

---

## 4. Docelowy model danych

### 4.1. AudioFeatures

Pełna ramka cech dźwięku, produkowana przez worker.

```ts
type AudioFeatures = {
  t: number; // czas hosta w sekundach

  rms: number; // 0..1 ogólna głośność
  peak: number; // 0..1 chwilowy peak

  bandLow: number; // 0..1 ~20-200 Hz
  bandMid: number; // 0..1 ~200-2000 Hz
  bandHigh: number; // 0..1 ~2000-12000 Hz

  spectralCentroid: number; // jasność dźwięku
  spectralFlux: number; // surowy onset detector
  zcr: number; // zero crossing rate

  chroma: Float32Array; // 12 binów — klasy wysokości

  estimatedBpm: number; // ostatnia stabilna estymacja
  beatPhase: number; // 0..1 pozycja w takcie
  beatConfidence: number; // 0..1 jak pewny estymator

  isOnset: boolean; // ten frame zawiera transient
  isStrongBeat: boolean; // beat zaakceptowany przez tracker
};
```

### 4.2. AudioEvent

Zdarzenia dyskretne emitowane przez analyzer.

```ts
type AudioEvent =
  | { kind: "beat"; t: number; strength: number; phase: number }
  | { kind: "onset"; t: number; band: "low" | "mid" | "high"; strength: number }
  | { kind: "phraseChange"; t: number; index: number }
  | { kind: "tempoChange"; t: number; bpm: number }
  | { kind: "silence"; t: number; durationMs: number }
  | { kind: "drop"; t: number; intensity: number };
```

### 4.3. ShaderAudioUniforms

Pakiet uniformów wystawiany do shaderów tunelu i tła.

```ts
type ShaderAudioUniforms = {
  uBeat: number;
  uBeatDecay: number;
  uBass: number;
  uMid: number;
  uTreble: number;
  uOnset: number;
  uTempoPhase: number;
  uChroma: THREE.Vector3;
  uMusicEnergy: number;
  uSpectralCentroid: number;
};
```

### 4.4. GameAudioState

To, co dostaje MusicEngine — stan gry przefiltrowany pod muzykę.

```ts
type GameAudioState = {
  speedNorm: number; // 0..1 prędkość znormalizowana
  curvatureNorm: number; // 0..1 jak ostro zakręca powierzchnia
  steerInput: number; // -1..1 wejście gracza
  airborne: boolean;
  groundedFor: number; // sekundy
  airborneFor: number;
  surfaceKind: SurfaceKind; // tube-inner/outer/sheet/cracked/...
  dangerLevel: number; // 0..1 jak blisko granicy safe tracku
  branchPending: boolean; // zbliża się decision gate
  recentJump: boolean;
  recentLanding: boolean;
  recentCrash: boolean;
  comboLevel: number; // 0..N kolejne udane sekcje
};
```

### 4.5. ProceduralMusicState

Wewnętrzny stan silnika muzycznego.

```ts
type ProceduralMusicState = {
  bpm: number;
  key: number; // 0..11 klasa wysokości
  scale: "minor" | "phrygian" | "dorian" | "pentaMinor" | "chromatic";
  bar: number;
  beatInBar: number;
  intensityTier: 0 | 1 | 2 | 3; // poziom warstw
  activeLayers: Set<MusicLayerId>;
  tension: number; // 0..1 — czy zbliża się drop / decyzja
  lastPhraseIndex: number;
};
```

---

## 5. Podział na systemy

### 5.1. SystemAudioCapture

Odpowiada za pozyskanie PCM z systemu / przeglądarki.

W przeglądarce realnie dostępne są:

```txt
- getDisplayMedia({ audio: true, video: true })
  Najsensowniejsza droga w Chromium — share tab/window/screen z audio.
  Wideo można od razu zatrzymać (track.stop()) jeżeli go nie używamy,
  ale w niektórych przeglądarkach prompt wymaga video:true.

- getUserMedia({ audio: true })
  Mikrofon — fallback / tryb "graj na żywo do gry".

- HTMLAudioElement → MediaElementAudioSourceNode
  Tryb "wrzuć plik mp3/ogg" — najprostszy do testów, bez promptów.
```

API publiczne:

```ts
type CaptureMode = "display" | "microphone" | "file" | "off";

audioCapture.start(mode: CaptureMode, fileBlob?: Blob): Promise<void>;
audioCapture.stop(): void;
audioCapture.getNode(): AudioNode;       // do podpięcia analizera
audioCapture.onError(cb): void;
```

Reguły:

```txt
- użytkownik świadomie zatwierdza capture (prompt przeglądarki),
- nie próbujemy łapać dźwięku w tle bez zgody,
- output captury NIE jest podpinany do destination,
  bo nie chcemy odgrywać systemowego audio z powrotem (echo / feedback).
- analyzer dostaje sygnał, ale audio nie wraca do głośników z naszej strony.
```

### 5.2. AudioAnalysisWorker

Sercem warstwy A. Działa w **AudioWorklet** (osobny audio thread), nie na main thread, nie w setInterval.

Odpowiedzialności:

```txt
- bufor PCM o stałym oknie (np. 2048 lub 4096),
- okno (Hann),
- FFT (np. fft.js / własny radix-2),
- pasma low/mid/high (ważone),
- spectral flux (poprzedni vs aktualny magnitude spectrum),
- onset detection (peak picking po fluxie z thresholdem dynamicznym),
- beat tracker (autokorelacja interbeat / comb filter),
- BPM estymacja (60..180),
- chroma (mapowanie binów FFT -> 12 klas wysokości),
- emisja AudioFeatures co ~16ms (60Hz),
- emisja AudioEvent gdy peak picker uzna transient za beat.
```

Worker NIE odpowiada za:

```txt
- generowanie muzyki,
- aktualizację shaderów,
- jakąkolwiek zależność od stanu gry.
```

Kontrakt wyjścia:

```ts
worker.port.onmessage = (e) => {
  if (e.data.type === "features") {
    bus.pushFeatures(e.data.features as AudioFeatures);
  }
  if (e.data.type === "event") {
    bus.pushEvent(e.data.event as AudioEvent);
  }
};
```

### 5.3. AudioMetadataBus

Centralna magistrala. Trzyma:

```txt
- ostatnią ramkę AudioFeatures,
- pierścieniowy bufor ostatnich N ramek (np. 4 sekundy),
- wygładzone wersje sygnałów (EMA / one-pole),
- subskrybentów eventów,
- snapshot dla shaderów.
```

API:

```ts
bus.pushFeatures(f: AudioFeatures): void;
bus.pushEvent(e: AudioEvent): void;

bus.getLatest(): AudioFeatures;
bus.getSmoothed(): SmoothedAudioFeatures;
bus.getShaderUniforms(): ShaderAudioUniforms;

bus.on(kind: AudioEvent["kind"], cb): UnsubscribeFn;
bus.tick(dt: number): void;     // wygładzanie i decay
```

Bus jest **single source of truth**. Shadery nie odpytują workera. MusicEngine nie odpytuje captury. Wszyscy gadają z busem.

### 5.4. ShaderAudioBridge

Most między busem a materiałami Three.js.

Zadania:

```txt
- co klatkę render() bierze bus.getShaderUniforms(),
- aplikuje wartości do uniformów wszystkich zarejestrowanych materiałów,
- zarządza decay impulsów (uBeatDecay, uOnset),
- wystawia API dla materiałów do "subskrypcji" na zestaw uniformów.
```

API:

```ts
shaderBridge.register(material: THREE.ShaderMaterial, profile: AudioUniformProfile): void;
shaderBridge.unregister(material): void;
shaderBridge.tick(dt): void;
```

Profil uniformów pozwala mieć różne presety:

```txt
- "tunnel-walls"   — bas mocno, beat decay długi
- "background"     — chroma, centroid, slow energy
- "bloom-postfx"   — onset, peak — szybki impuls
- "safe-track"     — beatPhase, mid energy
- "danger-overlay" — silence, low energy
```

### 5.5. MusicEngine — proceduralna muzyka na żywo

To warstwa B. Generuje muzykę reagującą na stan gry.

Architektura warstwowa (layers):

```txt
layer 0 — drone / pad   (zawsze gra, kotwica nastroju)
layer 1 — bassline      (włącza się przy speedNorm > 0.2)
layer 2 — kick / pulse  (włącza się przy speedNorm > 0.4)
layer 3 — arpeggio      (włącza się przy speedNorm > 0.6)
layer 4 — lead / hook   (włącza się przy combo / w trakcie sekcji safe)
layer 5 — fx / risers   (włącza się przy branchPending / pre-jump)
layer 6 — impact stings (eventowe — landing, crash, drop)
```

Każda warstwa ma:

```ts
type MusicLayer = {
  id: MusicLayerId;
  kind: "loop" | "phrase" | "arpeggio" | "drone" | "fx" | "sting";
  gain: GainNode;
  trigger(state: GameAudioState, beatInfo: BeatInfo): void;
  release(): void;
  tick(dt: number, state: GameAudioState): void;
};
```

Mapowanie stanu gry na muzykę (przykład docelowy):

```txt
speedNorm              ->  ogólna gęstość warstw, tempo arpeggia, filter cutoff lead
curvatureNorm          ->  amount LFO / wibrato na padzie
steerInput             ->  stereo pan, lekki pitch bend leadu
airborne               ->  reverb wet up, lowpass na drumach, side-chain off
groundedFor            ->  kick wraca, energia rośnie
surfaceKind=tube-outer ->  filter morph (otwiera się góra pasma)
surfaceKind=sheet      ->  warstwa drone'u zamienia się na choirpad
surfaceKind=cracked    ->  dodaje glitch fx
dangerLevel            ->  dissonant interval w padzie, tension up
branchPending          ->  riser, snare roll, build do downbeat decyzji
recentJump             ->  short woosh + reverse cymbal
recentLanding          ->  impact sting na najbliższy beat
recentCrash            ->  filter dump, silence 1 takt, restart phrase
comboLevel             ->  add layer 4 (lead)
```

Bardzo ważne: **muzyka musi być na siatce beatu**. Nawet jeżeli reaguje na input, zmiany warstw / zwrotek powinny zachodzić na granicach taktu, nie natychmiast. Inaczej będzie chaotycznie.

Stąd zasada:

```txt
state.intent  -> "chcę wejść w cięższą sekcję"
scheduler     -> "ok, zrobię to na nextBar"
sound out     -> "jest dropped na 1 kolejnego taktu"
```

Implementacja: rekomendowany **Tone.js** (Transport, Loop, Pattern, Synth, FilterEnvelope). Można też ręcznie po Web Audio, ale Tone daje gotowe scheduling i transport z look-ahead.

### 5.6. GameplayAudioBridge

Most z busa do logiki gry. Przykłady reakcji gameplayu na audio:

```txt
- na strongBeat z analizera systemowego audio:
    pulse safe tracku w kolorze,
    krótki snap kamery (mikro shake),
    speed boost cosmetic glow.

- na onset w pasmie low:
    pulsuje grunt powierzchni,
    spawn cząstek pod kulą.

- na drop:
    sekcja świata wchodzi w "neon mode",
    zwiększa intensywność bloomu,
    MusicEngine świadomie milczy żeby nie nakładać się na drop systemowy.
```

API:

```ts
gameplayBridge.bind("strongBeat", () => { ... });
gameplayBridge.bind("drop", () => { ... });
gameplayBridge.setEnabled(false);  // np. w menu
```

---

## 6. Fazy implementacji

### Milestone 1 — capture + worklet PCM (bez analizy)

Cel: dostać surowe PCM z systemowego audio do AudioWorkletu.

Pliki:

```txt
/js/audio/capture/systemAudioCapture.js
/js/audio/worklet/passthroughWorklet.js     // tylko log RMS
/js/audio/devOverlay/captureStatus.js       // HUD: "active / muted / Hz"
```

Acceptance:

```txt
- przycisk "start capture" pokazuje prompt przeglądarki,
- po akceptacji widać meter RMS w HUD,
- audio nie wraca do głośników z naszej strony,
- wyłączenie capture czyści wątek.
```

### Milestone 2 — AudioAnalysisWorker (FFT + pasma)

Cel: produkować AudioFeatures z low/mid/high/RMS/centroid.

Pliki:

```txt
/js/audio/worklet/analysisWorklet.js
/js/audio/dsp/fft.js
/js/audio/dsp/window.js
/js/audio/dsp/bands.js
```

Acceptance:

```txt
- worker emituje features ~60Hz,
- HUD pokazuje 3 paski (bass/mid/treble) reagujące na muzykę,
- main thread nie tnie nawet przy 144 fps.
```

### Milestone 3 — onset / beat / BPM

Cel: dodać detekcję transientów i estymator tempa.

Pliki:

```txt
/js/audio/dsp/spectralFlux.js
/js/audio/dsp/onsetDetector.js
/js/audio/dsp/beatTracker.js
```

Acceptance:

```txt
- na pewnym puszczonym kawałku 120 BPM
  estimatedBpm zbiega się do 120 ± 1 w < 5 sek,
- isOnset / isStrongBeat błyskają w HUD,
- emisja AudioEvent { kind: "beat" } widoczna w konsoli.
```

### Milestone 4 — AudioMetadataBus + ShaderAudioBridge

Cel: jeden materiał testowy w scenie pulsuje na bas/beat.

Pliki:

```txt
/js/audio/bus/audioMetadataBus.js
/js/audio/bridge/shaderAudioBridge.js
/js/audio/bridge/uniformProfiles.js
/js/scenes/audioTestScene.js
```

Acceptance:

```txt
- testowy ring w scenie pulsuje na uBass,
- testowy plane bloom-uje na uOnset,
- gdy capture off, wszystkie uniformy spadają do zera płynnie (decay).
```

### Milestone 5 — minimalny MusicEngine (drone + kick)

Cel: gra ma muzykę, nawet bez systemowego audio.

Pliki:

```txt
/js/audio/music/musicEngine.js
/js/audio/music/layers/droneLayer.js
/js/audio/music/layers/kickLayer.js
/js/audio/music/scheduler.js
```

Acceptance:

```txt
- po włączeniu gry słychać drone,
- kick wchodzi gdy speedNorm > 0.4,
- wszystkie eventy są na siatce beatu,
- wyłączenie tych warstw nie zostawia "wiszącego" tonu.
```

### Milestone 6 — MusicEngine reaguje na surface / safe track

Cel: zmiana powierzchni słychać.

Acceptance:

```txt
- wjazd w tube-outer otwiera filter na padzie,
- wjazd w sheet zmienia warstwę bass na sub,
- danger > 0.6 dodaje dysonans,
- wszystko to dzieje się na granicy taktu, nie w środku.
```

### Milestone 7 — eventy gameplayowe (jump / land / branch / crash)

Cel: muzyka i shadery reagują na momenty kluczowe.

Acceptance:

```txt
- skok = woosh + lowpass na drumach,
- lądowanie = impact sting na najbliższy beat,
- crash = filter dump + 1 takt ciszy,
- branchPending = riser przez 2 takty przed gate,
- zdarzenia idą przez gameplayBridge, nie wprost z fizyki.
```

### Milestone 8 — crossfade systemowe ↔ proceduralne

Cel: gracz może wybrać tryb.

```txt
mode: "system-only"       — gra cicho, slidery shaderów liczą się z systemowego audio,
mode: "procedural-only"   — capture off, gra własną muzykę,
mode: "hybrid"            — proceduralna muzyka schodzi w cień gdy systemowe audio gra,
                             wraca gdy systemowe milknie (silence event > 1.5 sek).
```

Acceptance:

```txt
- przejścia między modami są bez kliknięć,
- shadery dostają dane z aktywnego źródła,
- HUD pokazuje aktywny mode i BPM (z któregokolwiek źródła).
```

---

## 7. Zasady dla Executora

### Reguła 1

Audio analiza ZAWSZE w AudioWorklet, nigdy w setInterval / requestAnimationFrame na main thread. Gra ma jechać 60+ fps także na słabszych laptopach.

### Reguła 2

Nie podpinać outputu captury do destination. To powoduje feedback i echo, a użytkownik już słyszy systemowe audio swoim systemem.

### Reguła 3

Każdy etap ma mieć debug HUD. Bez wizualnej kontroli (RMS, paski pasm, BPM, beat blink) nie da się ocenić, czy worker działa poprawnie.

### Reguła 4

Nie startować capture automatycznie. Zawsze user gesture (kliknięcie). Inaczej `AudioContext` zostaje suspended, a `getDisplayMedia` rzuca NotAllowedError.

### Reguła 5

Każda zmiana w MusicEngine harmonijnie z transportem. Zmiany na granicy taktu, nie w środku. Wyjątek: warstwa "stings" (impact sounds), które są jednorazowe i nie trzymają rytmu.

### Reguła 6

Nie mieszać shaderowych odczytów z dwóch źródeł. Shadery zawsze z busa, nigdy bezpośrednio z analyserNode.

### Reguła 7

Wszystkie wartości do shaderów znormalizowane do 0..1 lub -1..1. Shader ma wiedzieć ile dostaje i nie kombinować z log10.

### Reguła 8

MusicEngine i AudioAnalyzer nie znają się nawzajem. Komunikacja wyłącznie przez bus. Inaczej zrobi się sprzężenie typu „mój kick wzbudza onset detector i piętrzy energię w nieskończoność”.

---

## 8. Minimalny interfejs nowego systemu

```ts
// 1. Bootstrap
const audio = await initAudioSystem({
  captureMode: "display",
  enableMusicEngine: true,
  enableShaderBridge: true,
});

// 2. Co klatkę renderera
audio.tick(dt);
audio.musicEngine.update(gameAudioState);

// 3. Materiały
audio.shaderBridge.register(tunnelMaterial, "tunnel-walls");
audio.shaderBridge.register(bgMaterial, "background");
audio.shaderBridge.register(bloomPass.material, "bloom-postfx");

// 4. Gameplay reakcje
audio.bus.on("strongBeat", (e) => fxLayer.pulse(e.strength));
audio.bus.on("drop", () => world.enterNeonMode());

// 5. Kontrola trybu
audio.setMode("hybrid");

// 6. Cleanup
audio.dispose();
```

---

## 9. Ryzyka techniczne

### Ryzyko 1 — capture systemowego audio jest ograniczony przeglądarkowo

`getDisplayMedia({audio:true})` w wielu przeglądarkach wymaga share **tabu** lub **całego ekranu**, a nie pojedynczego okna. Na macOS Safari i części wersji Firefoxa audio z displayMedia jest niedostępne. Mitigacja:

```txt
- Chromium-first,
- fallback "wrzuć plik" (drag & drop pliku audio),
- fallback "mikrofon",
- jasna informacja w UI co przeglądarka pozwala.
```

### Ryzyko 2 — beat tracking jest zawodny dla utworów bez wyraźnego transientu

Pady, ambient, niektóre electronic mogą oszukiwać estymator. Mitigacja:

```txt
- beatConfidence < 0.3  -> shadery używają tempoPhase = 0,
  zamiast losowo pulsować,
- MusicEngine ignoruje sync z systemowym audio,
  jedzie własnym Transport.bpm.
```

### Ryzyko 3 — pomiędzy main thread a workletem jest opóźnienie

Eventy „beat” mogą docierać 5–25 ms po faktycznym transiencie. Mitigacja:

```txt
- shadery używają beatPhase + decay, nie czystych eventów,
  więc lekkie opóźnienie nie razi,
- gameplay events nie są używane do osądzania timingu gracza
  (np. nie buduj rytmicznej mini-gry na tym),
- jeżeli kiedyś będzie potrzebny rytm-input, użyj
  performance.now() z sample-accurate look-ahead na poziomie workletu.
```

### Ryzyko 4 — Web Audio i AudioContext suspended po inactivity

Po przejściu w tab background AudioContext się usypia. Mitigacja:

```txt
- visibility change handler resume()/suspend(),
- pauza MusicEngine na hidden,
- decay shaderów do zera, żeby po wznowieniu nie błysnęły.
```

### Ryzyko 5 — feedback i echo

Odpalenie captury z mikrofonu, gdy gra puszcza swój sound do głośników, daje feedback loop. Mitigacja:

```txt
- mic mode automatycznie wycisza MusicEngine wyjście,
  albo MusicEngine gra tylko bardzo niski/cichy sub,
- najlepszy układ: słuchawki.
```

### Ryzyko 6 — generowana muzyka brzmi jak losowy szum

Bez ograniczeń skali, harmonii i rytmu MusicEngine zamienia się w generator chaosu. Mitigacja:

```txt
- jedna skala globalna (np. A minor pentatonic),
- jeden klucz na całą sesję, zmiana co N taktów,
- warstwy mają zdefiniowane role (bass / pad / lead),
  nie grają losowych dźwięków poza skalą,
- każda warstwa ma swój maks. rytmiczny zakres.
```

### Ryzyko 7 — podwójne źródła shaderowe

Pokusa „shader sobie sam zassie z analysera” skończy się rozjechanym pulsowaniem. Mitigacja:

```txt
- jedna brama: bus.getShaderUniforms(),
- code review odrzuca PR-y obchodzące bus.
```

### Ryzyko 8 — sprzężenie MusicEngine ↔ Analyzer

Jeśli analyzer dostanie sygnał wyjściowy z MusicEngine, to własny kick MusicEngine będzie zwiększał uBass i wywoływał onset → MusicEngine wzmocni warstwy → analyzer wykryje jeszcze więcej basu. Mitigacja:

```txt
- analyzer NIGDY nie słucha własnego output gry,
- analyzer słucha tylko zewnętrznego źródła (capture / file / mic),
- są to dwie odseparowane gałęzie audio graph.
```

---

## 10. Pierwszy realny task dla Executora

```txt
Dodaj moduł audio który:
1. Pozwala odpalić getDisplayMedia({audio:true, video:true})
   (video jest natychmiast stoppowane).
2. Podpina MediaStream do AudioContext i AudioWorklet (passthrough).
3. AudioWorklet wylicza RMS okna 2048 i wysyła do main thread co ~16ms.
4. W rogu ekranu jest mały HUD z wartością RMS i statusem capture.
5. Audio NIE wraca do głośników (brak connect do destination).
```

Pliki:

```txt
/js/audio/index.js
/js/audio/capture/systemAudioCapture.js
/js/audio/worklet/passthroughWorklet.js
/js/audio/devOverlay/captureHud.js
```

Acceptance:

```txt
- przycisk "Start capture" pokazuje prompt przeglądarki,
- po wyborze taba ze Spotify/YT pasek RMS w HUD reaguje,
- nie ma echa,
- "Stop capture" zeruje pasek i zwalnia tracki,
- konsola nie spamuje błędów.
```

---

## 11. Drugi task dla Executora

```txt
Rozbuduj AudioWorklet o pełny analyzer:
- FFT 2048 z oknem Hann,
- pasma low/mid/high (ważone wg uchu),
- spectral flux + onset detector,
- prosty beat tracker autokorelacyjny (BPM 60..180).

Wprowadź AudioMetadataBus jako single source of truth.
```

Pliki:

```txt
/js/audio/worklet/analysisWorklet.js
/js/audio/dsp/fft.js
/js/audio/dsp/window.js
/js/audio/dsp/bands.js
/js/audio/dsp/spectralFlux.js
/js/audio/dsp/onsetDetector.js
/js/audio/dsp/beatTracker.js
/js/audio/bus/audioMetadataBus.js
```

Acceptance:

```txt
- HUD pokazuje 3 paski pasm + aktualne BPM,
- punkt zapala się na każdym strongBeat,
- bus.getLatest() zwraca świeżą AudioFeatures co tick,
- bus.on("beat", cb) działa, cb nie jest wywoływane podwójnie.
```

---

## 12. Trzeci task dla Executora

```txt
Dodaj ShaderAudioBridge i pierwszy materiał reaktywny.
Stwórz testową scenę audioTestScene, w której:
- ring na środku skaluje się od uBass,
- tło ma vignette pulsujące od uOnset,
- za scharakteryzowanego beatu z systemowego audio
  oba reagują synchronicznie.

Po wyłączeniu capture wszystkie uniformy spadają do 0
płynnie (decay 0.4 sek), bez skoku.
```

Pliki:

```txt
/js/audio/bridge/shaderAudioBridge.js
/js/audio/bridge/uniformProfiles.js
/js/scenes/audioTestScene.js
/shaders/audio/ringPulse.vert
/shaders/audio/ringPulse.frag
/shaders/audio/bgVignette.frag
```

Acceptance:

```txt
- na puszczonym utworze ring i vignette pulsują w tym samym tempie,
- przy capture off — scena spokojna, brak migotania,
- nie ma dwóch ścieżek odczytu (tylko bus -> bridge -> material).
```

---

## 13. Czwarty task — pierwsze warstwy MusicEngine

```txt
Postaw Tone.js + Transport. Dodaj:
- droneLayer (zawsze gra cicho),
- kickLayer (włącza się po speedNorm > 0.4),
- bassLayer (włącza się po speedNorm > 0.2).

Wszystkie zmiany warstw zachodzą na nextBar.
```

Acceptance:

```txt
- bez capture / bez muzyki gra ma swój podkład,
- przyspieszenie kuli słychać jako wejście kicka,
- zwolnienie zdejmuje warstwy płynnie na granicy taktu,
- wyłączenie MusicEngine nie zostawia hangujących nut.
```

---

## 14. Piąty task — sprzężenie z gameplayem

```txt
Połącz GameAudioState z resztą gry przez adapter.
Adapter NIE czyta z fizyki bezpośrednio,
tylko z opublikowanego stanu gracza.
```

Pliki:

```txt
/js/audio/bridge/gameplayAudioBridge.js
/js/audio/bridge/gameStateAdapter.js
```

Mapowania na start (minimalne):

```txt
speedNorm     -> intensityTier MusicEngine
airborne      -> reverb wet up + lowpass na drumach
recentJump    -> woosh sting
recentLanding -> impact sting (na najbliższy beat)
recentCrash   -> filter dump + 1 takt ciszy
```

Acceptance:

```txt
- skok słychać,
- lądowanie słychać synchronicznie z beatem,
- crash przerywa muzykę i wraca do drone,
- nie ma podwójnych instancji adaptera.
```

---

## 15. Definicja sukcesu całego systemu audio

System audio jest gotowy, kiedy spełnia wszystkie poniższe naraz:

```txt
1. Gracz może puścić własny utwór (Spotify w drugim tabie, YT, plik mp3),
   wybrać go w prompcie share i widzi że tunel pulsuje na bas,
   bloom strzela na onsety, kolory tła płyną z chroma.

2. Gdy gracz nie udostępnia audio,
   gra ma własną muzykę proceduralną zsynchronizowaną z gameplayem.
   Muzyka rośnie z prędkością, wycisza się gdy gracz w powietrzu,
   wraca po lądowaniu na granicy taktu.

3. Wszystkie shadery reagujące na audio zaciągają dane z jednego busa.
   Można wyłączyć capture, włączyć MusicEngine i shadery dalej działają.
   Można odwrotnie: wyłączyć MusicEngine, włączyć capture i shadery dalej działają.

4. Audio nie wycieka. Capture jest tylko lokalny.
   Na zewnątrz wychodzą wyłącznie metadane (do shaderów / gameplayu).

5. Wszystkie eventy muzyczne reagujące na grę
   trafiają w siatkę beatu (z wyjątkiem stings),
   więc cała kompozycja brzmi spójnie nawet w chaotycznej sekcji.

6. Wydajność: AudioWorklet nie podbija main thread.
   Gra trzyma 60 fps na laptopie ze zintegrowaną grafiką.

7. Worklet, bus, bridge i MusicEngine są od siebie odseparowane
   tak mocno, że można podmienić generator muzyki na inny silnik
   bez ruszania reszty kodu.

8. Każdy SurfaceSegment z proceduralnego systemu powierzchni
   może deklaratywnie zmieniać profil muzyczny (filter / layer / scale)
   bez ingerowania w MusicEngine — przez tagi gameplay/audio.
```

---

## 16. Bardzo krótkie tl;dr dla Orchestratora

Kolejność prac dla agenta planującego:

```txt
1. Capture + worklet passthrough + HUD RMS.
2. Pełna analiza (FFT, pasma, onset, BPM).
3. AudioMetadataBus jako single source of truth.
4. ShaderAudioBridge + scena testowa z reaktywnym materiałem.
5. MusicEngine: drone + kick + bass na Tone.js Transport.
6. GameplayAudioBridge: skok / lądowanie / crash / branch.
7. Crossfade trybów: system-only / procedural-only / hybrid.
8. Pełne mapowanie surface kind -> warstwy muzyczne.
9. Optymalizacja, decay shaderów, visibility change handlers.
10. Polish: skala, klucz, fraza co N taktów, smooth transitions.
```

Najpierw warstwa danych. Potem reakcja shaderów. Potem muzyka. Potem sprzężenie z grą. Nigdy odwrotnie.
