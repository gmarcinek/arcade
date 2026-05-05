import * as THREE from 'three';
import { AudioMetadataBus } from './AudioMetadataBus.js';

const HIST_LEN = 256;

export class ShaderAudioBridge {
  constructor() {
    this._materials = new Map(); // material → true

    this._histData = new Uint8Array(HIST_LEN * 4); // RGBA
    this._histTex  = new THREE.DataTexture(this._histData, HIST_LEN, 1, THREE.RGBAFormat);
    this._histTex.wrapS      = THREE.RepeatWrapping;
    this._histTex.wrapT      = THREE.ClampToEdgeWrapping;
    this._histTex.minFilter  = THREE.LinearFilter;
    this._histTex.magFilter  = THREE.LinearFilter;
    this._histTex.needsUpdate = true;

    this._writeIdx = 0;
    this.MPS = 12.0; // metres per history sample — tunable
  }

  register(material) {
    this._materials.set(material, true);
    // Assign history texture immediately to silence null sampler2D warning
    if (material.uniforms && material.uniforms.uHistory !== undefined) {
      material.uniforms.uHistory.value = this._histTex;
    }
  }

  unregister(material) {
    this._materials.delete(material);
  }

  tick(dt) {
    const d = AudioMetadataBus.get();

    // Write history ring buffer
    const i4 = (this._writeIdx % HIST_LEN) * 4;
    this._histData[i4]     = Math.round(Math.min(1, d.low * 0.5 + d.mid * 0.5) * 255);
    this._histData[i4 + 1] = Math.round(Math.min(1, d.bassImpact) * 255);
    this._histData[i4 + 2] = Math.round(Math.min(1, d.midWave) * 255);
    this._histData[i4 + 3] = Math.round(Math.min(1, d.high + d.onsetPulse) * 255);
    this._histTex.needsUpdate = true;
    this._writeIdx++;

    const uniforms = {
      uSubBass:         d.sub,
      uBass:            d.low,
      uMid:             d.mid,
      uTreble:          d.high,
      uBassImpact:      d.bassImpact,
      uMidWave:         d.midWave,
      uLavaLight:       d.lavaLight,
      uOnsetPulse:      d.onsetPulse,
      uBeatPulse:       d.beatPulse,
      uMusicEnergy:     d.rms,
      uChromaTint:      new THREE.Vector3(...d.chroma),
      uHistory:         this._histTex,
      uHistoryWriteIdx: this._writeIdx % HIST_LEN,
      uHistoryLen:      HIST_LEN,
      uHistMps:         this.MPS,
    };

    for (const mat of this._materials.keys()) {
      if (!mat.uniforms) continue;
      for (const [key, val] of Object.entries(uniforms)) {
        if (mat.uniforms[key] !== undefined) {
          mat.uniforms[key].value = val;
        }
      }
    }
  }
}
