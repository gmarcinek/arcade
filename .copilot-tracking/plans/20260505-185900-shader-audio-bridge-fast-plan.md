# Plan: Wire ShaderAudioBridge to InfiniteMesh (Fast)

## Metadata

- **Feature**: shader-audio-bridge-infinite-mesh
- **Mode**: FAST
- **Status**: IN_PROGRESS

## Goal

Connect the ShaderAudioBridge audio uniforms to the InfiniteMesh tunnel shader so that music energy, bass, beats, etc. drive visual effects on the actual rendered tunnel.

## Tasks

- [ ] A–J: Add audio uniforms to `makeMaterial()` and wire them into the GLSL fragment shader
- [ ] K: Add `get material()` getter to `InfiniteMesh` class
- [ ] main.js: Register `infiniteMeshObj.material` with `audioSystem.bridge` after creation

## Verification

- Frontend build (`npm.cmd run build` in `tron-tunel-3/`)
