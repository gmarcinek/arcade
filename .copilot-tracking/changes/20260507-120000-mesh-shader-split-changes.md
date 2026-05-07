# Changes: Mesh Shader Split + Mandelbrot Fractal

## Metadata

- **Feature**: mesh-shader-split
- **Mode**: FAST
- **Status**: IN_PROGRESS
- **Plan**: .copilot-tracking/plans/20260507-120000-mesh-shader-split-fast-plan.md
- **Details**: none
- **Review**: none

## Summary

Split `mesh.shaders.js` into 6 focused GLSL module files connected by imports. Replaced the old silence grid+Julia fractal with a high-detail organic Mandelbrot-style fractal (deep red/white-hot, 15s breath, amplitude-driven by uSilenceGrid).

## Tasks

- [x] Create `mesh.shaders.vertex.js`
- [x] Create `mesh.shaders.uniforms.glsl.js`
- [x] Create `mesh.shaders.helpers.glsl.js`
- [x] Create `mesh.shaders.layers.glsl.js`
- [x] Create `mesh.shaders.silence.glsl.js` (new Mandelbrot fractal)
- [x] Create `mesh.shaders.post.glsl.js`
- [x] Update `mesh.shaders.js` to assemble from imports

## Files Modified

| File                                                        | Action   | Why                            |
| ----------------------------------------------------------- | -------- | ------------------------------ |
| `tron-tunel-3/src/procedural/mesh.shaders.vertex.js`        | Created  | Vertex shader source           |
| `tron-tunel-3/src/procedural/mesh.shaders.uniforms.glsl.js` | Created  | Uniforms + varyings GLSL       |
| `tron-tunel-3/src/procedural/mesh.shaders.helpers.glsl.js`  | Created  | Helper functions GLSL          |
| `tron-tunel-3/src/procedural/mesh.shaders.layers.glsl.js`   | Created  | void main() body layers        |
| `tron-tunel-3/src/procedural/mesh.shaders.silence.glsl.js`  | Created  | New Mandelbrot fractal         |
| `tron-tunel-3/src/procedural/mesh.shaders.post.glsl.js`     | Created  | Post-processing + gl_FragColor |
| `tron-tunel-3/src/procedural/mesh.shaders.js`               | Modified | Now assembles from imports     |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): SKIPPED (Vite ESM, no build step required)
- Tests: SKIPPED

## Notes

- `infiniteMesh.js` imports `{ vertexShader, fragmentShader }` — names preserved unchanged
- Old silence block (grid + Julia set) fully replaced with Mandelbrot fractal
- Fractal is always computed; uSilenceGrid × 15s sine breath drives amplitude
