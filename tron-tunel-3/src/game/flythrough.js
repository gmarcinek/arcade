import { camera } from '../scene.js';
import { carGroup, chunkManager, demoTrack, debugRenderer, PROCEDURAL_DEBUG } from './world.js';

const overlay = document.getElementById('overlay');

export let flythroughActive   = false;
export let flythroughS        = 0;
let        flythroughSurfaceId = null;

const FLYTHROUGH_SPEED = 55;

function getSafeTrackUAt(seg, localS) {
  const track = seg.safeTracks[0];
  if (!track || track.samples.length === 0) return 0;
  const progress = Math.max(0, Math.min(1, localS / seg.length));
  const rawIdx   = progress * (track.samples.length - 1);
  const idx      = Math.floor(rawIdx);
  const next     = Math.min(track.samples.length - 1, idx + 1);
  const localT   = rawIdx - idx;
  return track.samples[idx].u + (track.samples[next].u - track.samples[idx].u) * localT;
}

export function updateFlythroughCamera(dt) {
  if (!flythroughSurfaceId) {
    flythroughSurfaceId = chunkManager.getFirstSegmentId();
    flythroughS = 0;
  }

  flythroughS += FLYTHROUGH_SPEED * dt;

  const segLen = chunkManager.getSegmentLength(flythroughSurfaceId);
  if (flythroughS >= segLen) {
    const nextId = chunkManager.advanceToNextSegment(flythroughSurfaceId);
    if (nextId) {
      flythroughS -= segLen;
      flythroughSurfaceId = nextId;
      chunkManager.update(flythroughSurfaceId, flythroughS);
    } else {
      flythroughS = segLen - 0.1;
    }
  }

  const seg = demoTrack.surfaces.find(s => s.id === flythroughSurfaceId);
  if (!seg) return;

  const trackU = getSafeTrackUAt(seg, flythroughS);
  const frame  = demoTrack.getFrame(flythroughSurfaceId, flythroughS, trackU, 3);
  if (!frame) return;

  camera.position.copy(frame.position);
  camera.up.copy(frame.normal);
  camera.lookAt(frame.position.clone().addScaledVector(frame.forward, 20));
}

export function startFlythrough() {
  flythroughActive    = true;
  flythroughS         = 0;
  flythroughSurfaceId = null;
  overlay.style.display = 'none';
  carGroup.visible    = false;
  camera.fov = 85;
  camera.updateProjectionMatrix();
  if (debugRenderer) debugRenderer.setVisible(true);
}

export function stopFlythrough() {
  flythroughActive = false;
  carGroup.visible = true;
  camera.fov = 66;
  camera.updateProjectionMatrix();
  if (debugRenderer) debugRenderer.setVisible(PROCEDURAL_DEBUG);
  overlay.style.display = '';
}
