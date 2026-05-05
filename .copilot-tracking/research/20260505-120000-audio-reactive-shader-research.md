# Research: Audio-Reactive Shader System for tron-tunel-3

## Metadata

- **Feature**: audio-reactive-shader
- **Status**: COMPLETE

---

## Scope

Full audio-reactive pipeline for tron-tunel-3:

1. Screen audio capture via `getDisplayMedia`
2. Real-time FFT / beat / onset analysis (no AudioWorklet needed — see below)
3. `AudioMetadataBus` as single source of truth
4. `ShaderAudioBridge` pushing uniforms every frame
5. Reactive tunnel shader (`src/shaders.js`) and ball shader (`src/ballShaders.js`)

---

## Repo Findings

### Relevant Files

| File                               | Role                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `src/shaders.js`                   | Exports `tunnelVertexShader` + `tunnelFragmentShader`. All GLSL to modify.    |
| `src/tunnel.js`                    | Creates `tunnelMat` (ShaderMaterial) with uniforms; exports `createTunnel()`. |
| `src/ball.js`                      | Creates ball as `MeshStandardMaterial` with `cubeCamera` env-map reflection.  |
| `src/ballShaders.js`               | **Empty file** — placeholder for future ShaderMaterial.                       |
| `src/config.js`                    | `TUNNEL_FX`, `BALL_MAT` — config for uniforms.                                |
| `src/main.js`                      | Main loop: `loop()` → `tick()` → uniforms updated → `renderer.render()`.      |
| `src/state.js`                     | Game state object (not read fully but holds `carZ`, `carTheta`, etc.).        |
| `handof/audio-visualizer-v3a.html` | **Proven prototype** — full inline analysis + GLSL. Directly portable.        |
| `index.html`                       | `<script type="module" src="/src/main.js">` — ES module, Vite dev mode.       |
| `vite.config.js`                   | `viteSingleFile` plugin, `inlineDynamicImports: true`, target `es2022`.       |

### Existing tunnelMat Uniforms (tunnel.js)

```js
uniforms: {
  time,           // elapsedTime (seconds)
  playerZ,        // state.carZ
  playerTheta,    // state.carTheta
  playerLift,     // state.radialOffset (clamped to > 0)

  lavaStrength,              // TUNNEL_FX.lavaStrength (0.52)
  reflectionStrength,        // 0
  reflectionZOffset,         // 1
  reflectionLiftFadeStart,   // 0.35
  reflectionLiftFadeEnd,     // 5.2
  reflectionDarken,          // 0.18
  reflectionTint,            // 1.70
  reflectionHighlight,       // 120.55
}
```

> **Note:** `lavaStrength`, `reflectionStrength`, etc. are defined in uniforms but **not consumed** in the current `tunnelFragmentShader` — the shader hardcodes all values. This means the uniform block can be freely extended.

### Render Loop Structure (main.js)

```
requestAnimationFrame(loop)
  loop(t):
    dt = clamp(t - lastT, 0, 50ms)
    if flythroughActive:
      tunnelMat.uniforms.time.value = elapsedTime
      renderer.render()
      return
    tick(dt)
    tunnelMat.uniforms.time.value = elapsedTime
    tunnelMat.uniforms.playerZ.value = state.carZ   // legacy path
    tunnelMat.uniforms.playerTheta.value = state.carTheta
    tunnelMat.uniforms.playerLift.value = ...
    renderer.render(scene, camera)
```

**Integration point:** call `audioSystem.tick(dt, elapsedTime)` **before** the uniform writes, then push audio uniforms alongside the existing ones. Works for both flythrough and game paths.

### Proven Prototype Patterns (audio-visualizer-v3a.html)

**Audio capture:**

```js
mediaStream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
});
mediaStream.getVideoTracks().forEach((t) => t.stop()); // drop video immediately
// No connect to destination → no feedback loop
```

**Analysis (plain AnalyserNode, no WorkletNeeded):**

- `fftSize: 4096`, `smoothingTimeConstant: 0.35`
- Band energy function: RMS+peak hybrid, soft compression `pow(hybrid, 0.72)`
- Bands: sub 24–60 Hz, bass 60–180 Hz, lowMid 180–420 Hz, mid 420–2400 Hz, high 2400–9000 Hz
- Spectral flux → onset detection: adaptive threshold `mean + std * 1.35`, min inter-onset 55ms
- Beat detection: bass-gated, min inter-beat 240ms, median interval over 18 beats → BPM
- Derived composites: `bassImpact`, `midWave`, `lavaLight`, `ribbonDrive` (smoothed attack/release)
- Chroma vector for colour drift (RGB from 12 pitch classes)
- Outputs: `{ sub, low, mid, high, rms, bassImpact, midWave, lavaLight, ribbonDrive, beatPulse, onsetPulse, isOnset, chroma }`

**Audio history texture (for boundary scrolling):**

- `DataTexture(256 × 1, RGBA)` — ring buffer, written every frame
- R: composite low+mid for boundary shape
- G: bass for danger lines
- B: midwave history
- A: high+onset
- Sampled in GLSL by world-Z offset from playerZ

**Uniform names (prototype → game):**

```
uSubBass       → uSubBass   (sub 24-60 Hz)
uBass          → uBass      (bass 60-180 Hz)
uMid           → uMid       (mid band)
uTreble        → uTreble    (high band)
uBassImpact    → uBassImpact
uMidWave       → uMidWave
uLavaLight     → uLavaLight
uOnsetPulse    → uOnsetPulse
uBeatPulse     → uBeatPulse
uMusicEnergy   → uMusicEnergy  (rms)
uChromaTint    → uChromaTint   (vec3)
uHistory       → uHistory      (sampler2D, 256×1 RGBA DataTexture)
uHistoryWriteIdx, uHistoryLen, uHistMps  (history sampling params)
```

### Ball Material — Decision

**Keep MeshStandardMaterial. Use `onBeforeRender` for audio effects.**

Reasons:

- Ball already uses a `CubeCamera` env-map for chrome reflection — this requires `MeshStandardMaterial.envMap`
- Converting to `ShaderMaterial` loses the PBR env-map without reimplementing full PBR GLSL
- `ballShaders.js` is empty — it was reserved, not required
- Audio effects on the ball can be achieved via:
  - `ball.scale` modulation (beatPulse squash/stretch)
  - `ballMat.emissive` + `ballMat.emissiveIntensity` (reactive glow)
  - `carLight.intensity` modulation (bassImpact)
  - `ball.onBeforeRender` callback if shader uniforms are needed in a future ShaderMaterial

If a full ShaderMaterial is wanted later, `ballShaders.js` is the right place for it. The `createBall()` return already exposes `ballMat` so the coder can swap it.

### Vite WorkletSupport

**No AudioWorklet needed.** The prototype is proven with a plain `AnalyserNode` (no worker, no worklet).

`viteSingleFile` with `inlineDynamicImports: true` would problematically inline worklet files anyway. The `vite.config.js` has no `worker` section and no `?url` pattern.

If an AudioWorklet is desired in a future iteration:

```js
// Vite pattern for worklets:
import processorUrl from "./audioProcessor.js?url";
await audioCtx.audioWorklet.addModule(processorUrl);
```

But this is **not needed** for the current scope.

---

## Files to Create / Modify

### New Files

| File                             | Purpose                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| `src/audio/AudioCapture.js`      | `getDisplayMedia` capture, start/stop, AudioContext management           |
| `src/audio/AudioAnalyzer.js`     | `analyzeFrame(dt)` → `AudioMetadataBus` shape; ported from prototype     |
| `src/audio/AudioMetadataBus.js`  | Singleton — current frame's audio data; the single source of truth       |
| `src/audio/ShaderAudioBridge.js` | Registers materials, pushes uniforms each frame, manages history texture |
| `src/audio/index.js`             | Re-exports: `createAudioSystem()` factory used in main.js                |

### Modified Files

| File             | Change                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `src/shaders.js` | Add audio uniforms to fragment shader; add vertex displacement to vertex shader     |
| `src/tunnel.js`  | Add audio uniforms to `tunnelMat` uniform block                                     |
| `src/ball.js`    | Add `onBeforeRender` audio modulation to ballMat/carLight                           |
| `src/main.js`    | Instantiate audio system; call `audioSystem.tick()` in loop; wire audio UI button   |
| `src/config.js`  | (Optional) Add `AUDIO_CFG` defaults for sensitivity/gain                            |
| `src/style.css`  | Add `.audio-btn` and `#audio-panel` styles matching existing `.btn`/`.hud` patterns |
| `index.html`     | Add audio capture button to `#overlay` + mini audio status HUD element              |

---

## GLSL Audio Uniform Integration — Tunnel Shader

### Additions to `tunnelFragmentShader` uniforms block

```glsl
// Audio — add after existing uniforms
uniform float uSubBass;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBassImpact;
uniform float uMidWave;
uniform float uLavaLight;
uniform float uOnsetPulse;
uniform float uBeatPulse;
uniform float uMusicEnergy;
uniform vec3  uChromaTint;
uniform sampler2D uHistory;
uniform float uHistoryWriteIdx;
uniform float uHistoryLen;
uniform float uHistMps;
```

### History helper (port directly from prototype)

```glsl
vec4 historyAt(float z) {
  float worldDist = playerZ - z;
  float idxF = uHistoryWriteIdx + worldDist / uHistMps;
  float u = mod(idxF, uHistoryLen) / uHistoryLen;
  return texture2D(uHistory, vec2(u, 0.5));
}
```

### arcHalfAtZ — audio boundary modulation

```glsl
float arcHalfAtZ(float z) {
  float slow = sin(z * 0.009);
  float med  = sin(z * 0.038) * 0.42;
  float t = clamp((slow + med + 1.42) / 2.84, 0.0, 1.0);

  float audio = historyAt(z).r;
  float audioMod = (audio - 0.5) * 0.55;   // depth tunable
  t = clamp(t + audioMod, 0.05, 0.95);

  float bassWidth = (uSubBass * 0.10 + uBass * 0.18 + uBassImpact * 0.12 + uBeatPulse * 0.08);
  t = clamp(t + bassWidth, 0.05, 0.98);
  t = clamp(t + uBeatPulse * 0.08, 0.05, 0.98);

  return (4.0 + t * 56.0) * 0.05236;
}
```

### Lava pulse — replace hardcoded value

```glsl
// Replace: float lavaPulse = 0.72 + 0.28 * sin(time * 0.23 + 1.3);
float lavaPulse = 0.62 + 0.22 * sin(time * 0.23 + 1.3)
                + uMidWave * 0.22 + uLavaLight * 0.58 + uBeatPulse * 0.35
                + uOnsetPulse * 0.25;
```

### Lava colours — chroma tint

```glsl
// Replace static lavaDark/lavaMid/lavaHot:
vec3 lavaDark = mix(vec3(0.55, 0.10, 0.015), vec3(0.20, 0.40, 0.05), uChromaTint.g * 0.6);
vec3 lavaMid  = mix(vec3(0.95, 0.22, 0.025), vec3(0.30, 0.10, 0.55), uChromaTint.b * 0.5);
vec3 lavaHot  = mix(vec3(1.00, 0.48, 0.08),  vec3(1.00, 0.20, 0.40), uChromaTint.r * 0.4);
```

### Ring seams — beat flash

```glsl
// Add after existing ringSeam line:
col += ringSeam * vec3(0.0, 0.10, 0.20) * inSafe * depthFade * cyanRing * (1.0 + uBeatPulse * 1.5);
```

### Cyan strips — bass boost

```glsl
// Modify existing strip line:
float bassBoost = 1.0 + uBass * 1.6 + uOnsetPulse * 0.5;
col += strip * inSafe * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip * bassBoost;
```

### Amber tiles — onset flash

```glsl
// Modify existing tile line:
float tileBoost = 0.65 + uOnsetPulse * 1.4 + uBass * 0.5;
col += tileAng * tileZ * inSafe * vec3(1.0, 0.45, 0.04) * tileBoost * depthFade;
```

### Chevrons — treble speed

```glsl
// Modify pulse line for chevrons:
float chevSpeed = 5.5 + uTreble * 9.0 + uMid * 4.0;
float chev = abs(sin(vWorld.z * 0.85 - time * chevSpeed));
```

### Orange boundary — bass boost

```glsl
float bassBoostBound = 1.0 + uBass * 1.5 + uOnsetPulse * 0.8;
col += smoothstep(0.018, 0.0, edgeDist) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade * bassBoostBound;
```

### `tunnelVertexShader` — add vertex displacement (optional but visual)

```glsl
// Inject audio uniforms into vertex shader:
uniform float uSubBass;
uniform float uBass;
uniform float uBassImpact;
uniform float uMidWave;
uniform float uBeatPulse;
uniform float uOnsetPulse;

// In void main(), before gl_Position:
float angle = atan(position.x, -position.y);
float z = position.z;
float bassStretch = uSubBass * 0.020 + uBass * 0.032 + uBassImpact * 0.026 + uBeatPulse * 0.014;
float longWave =
    sin(z * 0.045 - time * (0.85 + uMidWave * 1.10) + angle * 2.0) * 0.55
  + sin(z * 0.095 + time * (1.20 + uMidWave * 1.70) - angle * 4.0) * 0.32
  + sin(z * 0.165 - time * (1.80 + uMidWave * 2.20) + angle * 6.0) * 0.13;
float kickRipple = sin(z * 0.24 - time * 5.4 + angle * 1.5) * (uBeatPulse * 0.018 + uOnsetPulse * 0.007);
float warp = longWave * (0.018 + uMidWave * 0.030) + kickRipple;
vec3 p = position;
p.xy *= 1.0 + bassStretch + warp;
// then use p instead of position in modelMatrix multiply
```

> Note: `tunnelVertexShader` currently just passes `position` → needs to expose `p`. The vertex shader is short (7 lines) — safe to rewrite.

---

## Ball Audio Modulation (onBeforeRender approach)

In `src/ball.js`, inside `updateCarVisuals()`:

```js
// Access audio bus (passed as parameter or imported singleton)
import { AudioMetadataBus } from "./audio/AudioMetadataBus.js";

// In updateCarVisuals():
const f = AudioMetadataBus.current;
if (f) {
  // Emissive glow on beat
  ballMat.emissive.setRGB(
    f.beatPulse * 0.15 + f.bassImpact * 0.05,
    f.beatPulse * 0.35 + f.midWave * 0.08,
    f.beatPulse * 0.55 + f.high * 0.12,
  );
  ballMat.emissiveIntensity = 0.8 + f.beatPulse * 2.5 + f.bassImpact * 1.2;

  // Scale pulse on beat
  const beatScale = 1.0 + f.beatPulse * 0.08 + f.onsetPulse * 0.04;
  ball.scale.setScalar(beatScale);

  // Car light reacts to bass
  carLight.intensity = 2.5 + f.bassImpact * 4.0 + f.beatPulse * 3.5;
  carLight.distance = 22 + f.low * 18;
}
```

`MeshStandardMaterial` supports `emissive` + `emissiveIntensity` — **no shader replacement needed.**

---

## UI Pattern — Audio Capture Button

Match `index.html` overlay button style. Add inside `#overlay` after existing `.btn` elements:

```html
<!-- In #overlay, after the flythrough button -->
<div
  id="audio-panel"
  style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:8px;"
>
  <button
    class="btn"
    id="audio-btn"
    style="background:rgba(255,106,0,0.15); color:#ff8844; border:1px solid rgba(255,106,0,0.4); font-size:11px; padding:8px 20px;"
  >
    ♫ AUDIO REACTIVE
  </button>
  <div
    id="audio-status"
    style="font-size:9px; letter-spacing:2px; color:rgba(255,140,60,0.55); text-transform:uppercase; display:none;"
  >
    CAPTURING · <span id="audio-bpm">— BPM</span>
  </div>
</div>
```

The "Spotify link" UI mentioned in the goal is **not achievable**: Spotify's web player cannot be screen-captured programmatically (Permissions Policy + DRM). The correct approach — which matches the prototype — is:

- Trigger `getDisplayMedia` and ask the user to share the browser tab where Spotify Web Player is open
- The "Spotify playlist link" UI becomes: an input/label for pasting the URL, then opening it in a new tab, then prompting the user to share that tab via `getDisplayMedia`

Suggested UX flow:

1. User pastes Spotify web link → button opens `window.open(url)` to Spotify Web Player
2. `audio-btn` click → `getDisplayMedia()` → user picks the Spotify tab + ticks "Share tab audio"
3. On capture: overlay audio-status shows BPM, status panel appears over HUD

---

## AudioMetadataBus Shape

```js
// src/audio/AudioMetadataBus.js
export const AudioMetadataBus = {
  current: null, // null when audio is off
  // When active, current = {
  //   sub, low, mid, high, rms,
  //   bassImpact, midWave, lavaLight, ribbonDrive,
  //   beatPulse, onsetPulse, isOnset,
  //   bpm,
  //   chroma: [r, g, b]
  // }
};
```

---

## ShaderAudioBridge Responsibilities

```js
// src/audio/ShaderAudioBridge.js
// - Owns the history DataTexture (256×1 RGBA)
// - register(material) — adds to list; expects standard audio uniform names
// - tick(f, elapsedTime) — updates history ring, pushes all uniforms to all registered materials
// - Called once per frame from main.js loop
```

`tunnelMat` is the primary registered material. Ball uses `AudioMetadataBus.current` directly.

---

## Constraints & Gotchas

1. **`getDisplayMedia` requires user gesture** — must be called from a click handler, never auto-started. Also blocked in cross-origin iframes.

2. **`viteSingleFile` + `inlineDynamicImports: true`** — This config is for production build only. During `vite dev`, modules work normally. No impact on the audio system. AudioWorklet `?url` imports would break the singlefile build.

3. **`tunnelFragmentShader` does not consume most existing uniforms** — `lavaStrength`, `reflectionStrength`, etc. are defined in `tunnelMat.uniforms` but the GLSL ignores them. Adding new audio uniforms to the ShaderMaterial block and to the GLSL is self-consistent and safe.

4. **PROCEDURAL_PLAYER = true in main.js** — The legacy `playerZ`/`playerTheta`/`playerLift` uniform updates are skipped. Audio uniforms must be pushed in **both** the flythrough branch and the main code path (or extracted to a shared helper). The `time` uniform is already updated in both branches.

5. **Ball CubeCamera reflection** — `cubeCamera.update(renderer, scene)` is called inside `updateCarVisuals()`. If ball is converted to ShaderMaterial, env-map must be manually re-bound or the cube camera update removed. Keep `MeshStandardMaterial` to avoid this.

6. **No `smoothstep` in vertex shader** — The current `tunnelVertexShader` is GLSL 1.0-compatible (Three.js injects precision). `smoothstep` is available, but the vertex shader does not import `#include` chunks. Keep displacement math in plain arithmetic only.

7. **Audio context auto-play policy** — `AudioContext` must be created or resumed inside a user gesture handler. The overlay click button satisfies this.

---

## Verification

- Backend: N/A
- Frontend dev: `cd tron-tunel-3 && npm run dev` → open `http://localhost:5177`
- Build: `cd tron-tunel-3 && npm run build` (checks for import errors)
- Manual: Click "AUDIO REACTIVE" → share tab playing Spotify → verify BPM readout, lava pulses, boundary breathes with bass, beat flash on rings
- No-audio fallback: game must run identically when audio system is not started (`AudioMetadataBus.current === null` → bridge pushes zeros for all audio uniforms)
