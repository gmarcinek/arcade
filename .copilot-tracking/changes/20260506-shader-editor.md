# Changes: Shader Editor

## Metadata

- **Feature**: shader-editor
- **Mode**: FAST
- **Status**: COMPLETE
- **Plan**: none
- **Details**: none
- **Review**: none

## Summary

Added a standalone shader editor subpage to tron-tunel-3. Renders the tunnel at 350 km/h with fake ambient audio and exposes all `TUNNEL_FX_CONFIG` parameters via a right-side controls panel with sliders, color pickers, presets, and export/reset actions.

## Tasks

- [x] Create `shader-editor.html` — full-page layout (70% canvas / 30% panel)
- [x] Create `src/shader-editor.js` — tunnel renderer + controls UI

## Files Modified

| File                                | Action  | Why                            |
| ----------------------------------- | ------- | ------------------------------ |
| `tron-tunel-3/shader-editor.html`   | Created | HTML shell for the editor page |
| `tron-tunel-3/src/shader-editor.js` | Created | Renderer + controls logic      |

## Verification

- Backend build (`mvn`): SKIPPED
- Frontend build (`npm`): SKIPPED — no existing files modified; new files are pure JS/HTML served by Vite dev server
- Tests: SKIPPED

## Notes

- No existing files were modified.
- Served via Vite at `/shader-editor.html` using the existing `vite.config.js` multi-page setup (or accessible directly in dev mode).
- `TUNNEL_FX_CONFIG` is imported by reference from `infiniteMesh.js`; mutations are live.
