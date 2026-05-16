import * as THREE from 'three';
import { AudioMetadataBus } from '../audio/AudioMetadataBus.js';

import { TUNNEL_FX_CONFIG } from './infinite-mesh/config.js';
import { makeMaterial } from './infinite-mesh/material.js';
import { buildGeometry } from './infinite-mesh/geometry.js';
import { JumpWaveSystem } from './infinite-mesh/jump-waves.js';
import {
  syncAudioUniforms,
  syncConfigUniforms,
  syncOpacityUniforms,
} from './infinite-mesh/uniforms.js';
import { breatheLevel } from './infinite-mesh/breathe.js';
import { updateVertices } from './infinite-mesh/vertex-update.js';

// Re-export so existing consumers keep working unchanged.
export { TUNNEL_FX_CONFIG };

// InfiniteMesh
//
// Orchestrates a streaming tunnel mesh that follows the player along a spline.
// The class owns:
//   - geometry  (BufferGeometry, rebuilt vertex attrs every frame)
//   - material  (ShaderMaterial with audio/parallax/opacity uniforms)
//   - jump-wave state
//   - opacity-smoothing state
//   - silence-grid state
//
// Per frame, update():
//   1. advances jump waves and writes them to uniforms
//   2. drives the macro breathe envelope (waveAmp/shakeAmp on TUNNEL_FX_CONFIG)
//   3. syncs audio, config, and opacity uniforms
//   4. rewrites vertex positions/normals along the active band
//   5. updates time/player uniforms

export class InfiniteMesh {
  constructor(scene, spline, crossSection) {
    this._scene  = scene;
    this._spline = spline;
    this._cs     = crossSection;
    this._time   = 0;
    this._lastDt = 0;
    this._opSmooth = {};
    this._silenceGrid = 1.0;
    this._jumpWaves = new JumpWaveSystem();
    this._build();
  }

  get material() {
    return this._mat;
  }

  setSpline(spline) {
    this._spline = spline;
  }

  setHeatZone(frac, heat) {
    this._mat.uniforms.uHeatZoneFrac.value = frac;
    this._mat.uniforms.uEdgeHeat.value     = heat;
  }

  /** Call when player jumps or bounces. Each call adds a new wave. */
  triggerJumpWave(currentS, speed, power = 1.0) {
    this._jumpWaves.trigger(currentS, speed, power);
  }

  _build() {
    const { geometry } = buildGeometry();
    this._geo  = geometry;
    this._mat  = makeMaterial();
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
  }

  update(playerGlobalS, playerWorldPos, dt) {
    this._time += dt;
    this._lastDt = dt;

    // Advance and write jump waves.
    this._jumpWaves.update(dt);
    this._jumpWaves.writeUniforms(this._mat.uniforms);

    const audio = AudioMetadataBus.get();

    // Breathing envelope drives waveAmp and shakeAmp through the macro pattern.
    const bl = breatheLevel(this._time);
    TUNNEL_FX_CONFIG.waveAmp  = 0.5 + bl * 4.5;
    TUNNEL_FX_CONFIG.shakeAmp = bl * 0.08;

    syncAudioUniforms(this._mat.uniforms, audio, this, dt);
    syncConfigUniforms(this._mat.uniforms, audio, this._time);
    syncOpacityUniforms(this._mat.uniforms, audio, dt, this._opSmooth, this._time);

    updateVertices({
      geo: this._geo,
      spline: this._spline,
      cs: this._cs,
      playerGlobalS,
      time: this._time,
      jumpWaves: this._jumpWaves.list,
      audio,
    });

    this._mat.uniforms.time.value = this._time;
    this._mat.uniforms.playerGlobalS.value = playerGlobalS;
    this._mat.uniforms.playerWorldPos.value.copy(playerWorldPos);
  }

  dispose() {
    this._scene.remove(this._mesh);
    this._geo.dispose();
    this._mat.dispose();
  }
}
