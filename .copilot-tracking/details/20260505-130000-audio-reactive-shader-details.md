# Details: Audio-Reactive Shader System

## Metadata

- **Feature**: audio-reactive-shader
- **Status**: COMPLETE
- **Plan**: [.copilot-tracking/plans/20260505-130000-audio-reactive-shader-plan.md](../plans/20260505-130000-audio-reactive-shader-plan.md)

---

## Implementation Notes

### Task 1 — Audio module scaffold

**Scope:** Create 5 files under `tron-tunel-3/src/audio/`. No imports from game code yet.

**Files:**

- `src/audio/AudioMetadataBus.js`
- `src/audio/AudioCapture.js`
- `src/audio/AudioAnalyzer.js`
- `src/audio/ShaderAudioBridge.js`
- `src/audio/index.js`

**Pattern:** Port directly from `tron-tunel-3/handof/audio-visualizer-v3a.html` (prototype). All logic is inline in that HTML — extract into the module structure below.

**`AudioMetadataBus.js`** — single export, mutable singleton:

```js
export const AudioMetadataBus = {
  current: null,
  // When active, current = {
  //   sub, low, mid, high, rms,
  //   bassImpact, midWave, lavaLight, ribbonDrive,
  //   beatPulse, onsetPulse, isOnset, bpm,
  //   chroma: [r, g, b]   // 0..1 each
  // }
};
```

**`AudioCapture.js`** — manages `getDisplayMedia` + AudioContext lifecycle:

```js
export class AudioCapture {
  constructor() {
    this._ctx = null;
    this._stream = null;
    this._source = null;
  }
  async start(analyzerNode) {
    /* getDisplayMedia → drop video tracks → connect source → analyzerNode */
  }
  stop() {
    /* stop tracks, close ctx */
  }
}
```

Key: `{ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`.
Drop video tracks immediately after `getDisplayMedia` returns. Do NOT connect to `ctx.destination`.

**`AudioAnalyzer.js`** — wraps AnalyserNode, computes all bands/beats/chroma per frame:

```js
export class AudioAnalyzer {
  constructor(audioCtx) {
    /* fftSize: 4096, smoothing: 0.35 */
  }
  analyzeFrame(dt) {
    /* returns AudioMetadataBus shape */
  }
}
```

Band energy: RMS+peak hybrid, `pow(hybrid, 0.72)` soft compression.
Bands (Hz): sub 24-60, bass 60-180, lowMid 180-420, mid 420-2400, high 2400-9000.
Onset: spectral flux + adaptive threshold `mean + std * 1.35`, min inter-onset 55ms.
Beat: bass-gated, min 240ms, median interval over 18 beats → BPM.
Derived: `bassImpact` (attack 0.06s/release 0.18s), `midWave` (0.12/0.32), `lavaLight` (0.08/0.42), `ribbonDrive` (0.04/0.25).
`onsetPulse`: set to 1.0 on onset, decay `* 0.88` each frame.
`beatPulse`: set to 1.0 on beat, decay `* 0.82` each frame.
Chroma: 12 pitch classes → map to RGB: R = sum of classes 0,2,4 / G = 5,7,9 / B = 10,11,1.

**`ShaderAudioBridge.js`** — owns DataTexture, pushes uniforms:

```js
const HIST_LEN = 256;
export class ShaderAudioBridge {
  constructor() {
    this._materials = [];
    this._histData = new Uint8Array(HIST_LEN * 4); // RGBA
    this._histTex = new THREE.DataTexture(
      this._histData,
      HIST_LEN,
      1,
      THREE.RGBAFormat,
    );
    this._histTex.needsUpdate = true;
    this._writeIdx = 0;
    this._histMps = 8.0; // metres-per-sample — tunable
  }
  register(material) {
    this._materials.push(material);
  }
  tick(f, elapsedTime) {
    // 1. Write history ring buffer (f may be null → write zeros)
    // 2. Push all uniforms to all registered materials
  }
}
```

History write (per frame): advance `_writeIdx`, write RGBA byte:

- R: `clamp(f ? (f.low * 0.6 + f.mid * 0.4), 0, 1) * 255`
- G: `clamp(f ? f.bassImpact, 0, 1) * 255`
- B: `clamp(f ? f.midWave, 0, 1) * 255`
- A: `clamp(f ? (f.high * 0.7 + (f.isOnset ? 1 : 0) * 0.3), 0, 1) * 255`

Uniform push when `f` is null → push 0 for all floats, `[0,0,0]` for chroma, history texture still assigned.

**`index.js`** — factory:

```js
import { AudioMetadataBus } from "./AudioMetadataBus.js";
import { AudioCapture } from "./AudioCapture.js";
import { AudioAnalyzer } from "./AudioAnalyzer.js";
import { ShaderAudioBridge } from "./ShaderAudioBridge.js";
import * as THREE from "three";

export function createAudioSystem() {
  const capture = new AudioCapture();
  let analyzer = null;
  const bridge = new ShaderAudioBridge();

  return {
    bridge,
    async startCapture() {
      const ctx = new AudioContext();
      analyzer = new AudioAnalyzer(ctx);
      await capture.start(analyzer.analyzerNode);
      ctx.resume();
    },
    stopCapture() {
      capture.stop();
      AudioMetadataBus.current = null;
    },
    tick(dt, elapsedTime) {
      if (analyzer && capture.active) {
        AudioMetadataBus.current = analyzer.analyzeFrame(dt);
      }
      bridge.tick(AudioMetadataBus.current, elapsedTime);
    },
  };
}
```

**Main checks:**

- `npm run build` — no import errors
- `npm run dev` — game loads, no 404s for audio modules

---

### Task 2 — Shader uniform declarations

**Scope:** Add 13 uniforms to GLSL strings in `shaders.js` and matching JS entries in `tunnel.js`. Atomic — do both files in one commit.

**Files:** `src/shaders.js`, `src/tunnel.js`

**Pattern:** Follow existing uniform block in each file. The fragment shader already has `uniform float time; uniform float playerZ; ...` at top of string — append after those. Vertex shader is 7 lines — add before `void main()`.

Add to **`tunnelVertexShader`** (before `void main()`):

```glsl
uniform float uSubBass;
uniform float uBass;
uniform float uBassImpact;
uniform float uMidWave;
uniform float uBeatPulse;
uniform float uOnsetPulse;
```

Add to **`tunnelFragmentShader`** (after existing uniforms block, before `varying`):

```glsl
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

Add to **`tunnelMat.uniforms`** in `tunnel.js` (after existing entries):

```js
uSubBass:          { value: 0 },
uBass:             { value: 0 },
uMid:              { value: 0 },
uTreble:           { value: 0 },
uBassImpact:       { value: 0 },
uMidWave:          { value: 0 },
uLavaLight:        { value: 0 },
uOnsetPulse:       { value: 0 },
uBeatPulse:        { value: 0 },
uMusicEnergy:      { value: 0 },
uChromaTint:       { value: new THREE.Vector3(0, 0, 0) },
uHistory:          { value: null },
uHistoryWriteIdx:  { value: 0 },
uHistoryLen:       { value: 256 },
uHistMps:          { value: 8.0 },
```

**Main checks:**

- Browser console — zero `WebGL: INVALID_OPERATION` or uniform-not-found warnings
- Visual output unchanged from before

---

### Task 3 — GLSL audio effects

**Scope:** All GLSL modifications are in `src/shaders.js`. No JS changes. Work section by section.

**Files:** `src/shaders.js`

**Pattern:** Locate existing lines using the exact text already in the file; replace/inject as described below. The fragment shader is ~300 lines — read it before editing.

**Vertex shader rewrite** — replace the 7-line `tunnelVertexShader` export:

```glsl
export const tunnelVertexShader = /* glsl */`
  uniform float time;
  uniform float uSubBass;
  uniform float uBass;
  uniform float uBassImpact;
  uniform float uMidWave;
  uniform float uBeatPulse;
  uniform float uOnsetPulse;

  varying vec3 vWorld;

  void main() {
    float angle = atan(position.x, -position.y);
    float z     = position.z;

    float bassStretch = uSubBass * 0.020 + uBass * 0.032 + uBassImpact * 0.026 + uBeatPulse * 0.014;
    float longWave =
        sin(z * 0.045 - time * (0.85 + uMidWave * 1.10) + angle * 2.0) * 0.55
      + sin(z * 0.095 + time * (1.20 + uMidWave * 1.70) - angle * 4.0) * 0.32
      + sin(z * 0.165 - time * (1.80 + uMidWave * 2.20) + angle * 6.0) * 0.13;
    float kickRipple = sin(z * 0.24 - time * 5.4 + angle * 1.5)
                     * (uBeatPulse * 0.018 + uOnsetPulse * 0.007);
    float warp = longWave * (0.018 + uMidWave * 0.030) + kickRipple;

    vec3 p = position;
    p.xy *= 1.0 + bassStretch + warp;

    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld  = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
```

> Note: `time` uniform is already injected by THREE.js? — No, it is declared in the JS uniform block and forwarded. Add `uniform float time;` to vertex shader uniforms since we now use it in longWave expressions.

**Fragment shader edits** (exact string replacements):

1. **Add `historyAt()` helper** — insert after the `angleDist` function, before `void main()`:

```glsl
vec4 historyAt(float z) {
  float worldDist = playerZ - z;
  float idxF = uHistoryWriteIdx + worldDist / uHistMps;
  float u = mod(idxF, uHistoryLen) / uHistoryLen;
  return texture2D(uHistory, vec2(u, 0.5));
}
```

2. **`arcHalfAtZ`** — replace entire function (lines ~14-20 in current file):

```glsl
float arcHalfAtZ(float z) {
  float slow = sin(z * 0.009);
  float med  = sin(z * 0.038) * 0.42;
  float t = clamp((slow + med + 1.42) / 2.84, 0.0, 1.0);

  float audio    = historyAt(z).r;
  float audioMod = (audio - 0.5) * 0.55;
  t = clamp(t + audioMod, 0.05, 0.95);

  float bassWidth = uSubBass * 0.10 + uBass * 0.18 + uBassImpact * 0.12 + uBeatPulse * 0.08;
  t = clamp(t + bassWidth, 0.05, 0.98);

  return (4.0 + t * 56.0) * 0.05236;
}
```

3. **`lavaPulse`** — replace hardcoded line:

```glsl
// OLD:
float lavaPulse = 0.72 + 0.28 * sin(time * 0.23 + 1.3);
// NEW:
float lavaPulse = 0.62 + 0.22 * sin(time * 0.23 + 1.3)
                + uMidWave * 0.22 + uLavaLight * 0.58
                + uBeatPulse * 0.35 + uOnsetPulse * 0.25;
```

4. **Lava colours** — replace the three `vec3` colour lines:

```glsl
// OLD:
vec3 lavaDark = vec3(0.55, 0.10, 0.015);
vec3 lavaMid  = vec3(0.95, 0.22, 0.025);
vec3 lavaHot  = vec3(1.00, 0.48, 0.08);
// NEW:
vec3 lavaDark = mix(vec3(0.55, 0.10, 0.015), vec3(0.20, 0.40, 0.05), uChromaTint.g * 0.6);
vec3 lavaMid  = mix(vec3(0.95, 0.22, 0.025), vec3(0.30, 0.10, 0.55), uChromaTint.b * 0.5);
vec3 lavaHot  = mix(vec3(1.00, 0.48, 0.08),  vec3(1.00, 0.20, 0.40), uChromaTint.r * 0.4);
```

5. **Ring seam beat flash** — locate the `col += ringSeam * ...` line and multiply by `(1.0 + uBeatPulse * 1.5)`.

6. **Cyan strip bass boost** — locate the `col += strip * inSafe * vec3(0.04, 0.75, 0.90)` line:

```glsl
float bassBoost = 1.0 + uBass * 1.6 + uOnsetPulse * 0.5;
col += strip * inSafe * vec3(0.04, 0.75, 0.90) * (0.30 + pulse * 0.50) * depthFade * cyanStrip * bassBoost;
```

7. **Amber tile onset boost** — locate tile colour contribution:

```glsl
float tileBoost = 0.65 + uOnsetPulse * 1.4 + uBass * 0.5;
col += tileAng * tileZ * inSafe * vec3(1.0, 0.45, 0.04) * tileBoost * depthFade;
```

8. **Chevron treble speed** — locate `float chev = abs(sin(vWorld.z * 0.85 - time * 5.5))` (or similar) and replace the speed constant:

```glsl
float chevSpeed = 5.5 + uTreble * 9.0 + uMid * 4.0;
float chev = abs(sin(vWorld.z * 0.85 - time * chevSpeed));
```

9. **Orange boundary bass boost** — locate the `smoothstep(0.018, 0.0, edgeDist)` orange line:

```glsl
float bassBoostBound = 1.0 + uBass * 1.5 + uOnsetPulse * 0.8;
col += smoothstep(0.018, 0.0, edgeDist) * vec3(1.0, 0.88, 0.45) * 4.5 * depthFade * bassBoostBound;
```

**Main checks:**

- No GLSL compile errors in browser console (red shader error messages)
- Game runs with all audio uniforms = 0: visuals look the same as before Task 2
- `uBeatPulse = 1` injected via devtools → visible ring flash + lava boost

---

### Task 4 — Ball audio modulation

**Scope:** `ball.js` only. Add `AudioMetadataBus` import + modulation block in `updateCarVisuals()`.

**Files:** `src/ball.js`

**Pattern:** `updateCarVisuals()` already accepts `(dt, ballObjects, renderer, scene, frame)` — the `ballObjects` destructure includes `ballMat`, `ball`, and `carLight` (check exact return shape from `createBall()`). Read the full `createBall()` return before editing.

```js
// At top of ball.js:
import { AudioMetadataBus } from "./audio/AudioMetadataBus.js";

// Inside updateCarVisuals(), near the end (after visual updates, before return):
const f = AudioMetadataBus.current;
if (f) {
  ballMat.emissive.setRGB(
    f.beatPulse * 0.15 + f.bassImpact * 0.05,
    f.beatPulse * 0.35 + f.midWave * 0.08,
    f.beatPulse * 0.55 + f.high * 0.12,
  );
  ballMat.emissiveIntensity = 0.8 + f.beatPulse * 2.5 + f.bassImpact * 1.2;
  const beatScale = 1.0 + f.beatPulse * 0.08 + f.onsetPulse * 0.04;
  ball.scale.setScalar(beatScale);
  carLight.intensity = 2.5 + f.bassImpact * 4.0 + f.beatPulse * 3.5;
  carLight.distance = 22 + f.low * 18;
}
```

**Main checks:**

- Ball renders normally (no emissive glow) when `AudioMetadataBus.current = null`
- Devtools: `import('/src/audio/AudioMetadataBus.js').then(m => m.AudioMetadataBus.current = {beatPulse:1, bassImpact:0.8, midWave:0.3, high:0.2, onsetPulse:0.5, low:0.5})` → visible glow on ball

---

### Task 5 — main.js + index.html wiring

**Scope:** Wire audio system into game loop and add UI elements.

**Files:** `src/main.js`, `index.html`

**`main.js` changes:**

1. Import at top:

```js
import { createAudioSystem } from "./audio/index.js";
```

2. After tunnel/lights/ball setup (before `setupInput()`):

```js
const audioSystem = createAudioSystem();
audioSystem.bridge.register(tunnelMat);
```

3. In the **flythrough branch** of `loop()`, before `renderer.render()`:

```js
audioSystem.tick(dt, elapsedTime);
// push audio uniforms from bridge (bridge.tick() already handles this)
```

> `bridge.tick()` is called inside `audioSystem.tick()` — no separate push needed.

4. In the **main loop path**, before `tunnelMat.uniforms.time.value = elapsedTime`:

```js
audioSystem.tick(dt, elapsedTime);
```

5. UI wiring (add after existing `document.getElementById` event listeners):

```js
document.getElementById("open-spotify-btn").addEventListener("click", () => {
  const url = document.getElementById("spotify-input").value.trim();
  if (url) window.open(url, "_blank");
});

document.getElementById("audio-btn").addEventListener("click", async () => {
  try {
    await audioSystem.startCapture();
    document.getElementById("audio-status").style.display = "block";
    // BPM update happens via AudioMetadataBus — poll in rAF or update in tick
  } catch (e) {
    console.warn("Audio capture failed:", e);
  }
});
```

6. In `loop()`, after `audioSystem.tick()`, update BPM display:

```js
const f = AudioMetadataBus.current; // import at top too
if (f && f.bpm)
  document.getElementById("audio-bpm").textContent = Math.round(f.bpm) + " BPM";
```

**`index.html` changes** — add inside `#overlay`, after `#flythrough-btn`:

```html
<div
  id="audio-panel"
  style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:12px;"
>
  <div style="display:flex; gap:6px; align-items:center;">
    <input
      id="spotify-input"
      type="url"
      placeholder="Spotify link…"
      style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,106,0,0.35); color:#ff9955;
             font-size:11px; padding:6px 10px; border-radius:4px; width:220px; outline:none;"
    />
    <button
      class="btn"
      id="open-spotify-btn"
      style="background:rgba(30,215,96,0.12); color:#1ed760; border:1px solid rgba(30,215,96,0.35);
             font-size:11px; padding:6px 14px; margin-top:0;"
    >
      OPEN
    </button>
  </div>
  <button
    class="btn"
    id="audio-btn"
    style="background:rgba(255,106,0,0.15); color:#ff8844; border:1px solid rgba(255,106,0,0.4);
           font-size:11px; padding:8px 20px;"
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

**UX note:** User flow is: (1) paste Spotify URL → click OPEN → Spotify Web Player opens in new tab; (2) click AUDIO REACTIVE → `getDisplayMedia` dialog → user picks Spotify tab + ticks "Share tab audio"; (3) BPM readout appears.

**Main checks:**

- No-audio path: click Start → game runs normally, no JS errors
- Audio path: full manual flow → BPM visible, lava reacts on bass hits
- Fallback: close Spotify tab mid-game → `AudioMetadataBus.current` goes null → bus stays null until next `analyzeFrame` (capture ends) → all uniforms pushed as 0 → game continues normally

---

## Dependencies

- Tasks 2 and 3 must be done atomically (uniform names must be consistent between GLSL and `tunnel.js`)
- Task 4 (ball.js) requires `AudioMetadataBus.js` from Task 1
- Task 5 (main.js) requires Tasks 1–4 complete

## Risks

- **shaders.js is long (~300+ lines):** read the full file before editing; locate exact strings to replace — do not rely on line estimates from this document
- **`updateCarVisuals()` return shape:** read `createBall()` and `updateCarVisuals()` in `ball.js` before adding the modulation block — confirm `ballMat`, `ball`, `carLight` are accessible in scope
- **`getDisplayMedia` on localhost:** works on `localhost`; will fail on non-HTTPS remote hosts — dev server is fine
- **`uHistory` is `null` until `ShaderAudioBridge` registers:** THREE.js ShaderMaterial will warn but not crash on a `null` sampler2D — assign the bridge's DataTexture to `tunnelMat.uniforms.uHistory.value` inside `bridge.register(material)` to silence the warning
