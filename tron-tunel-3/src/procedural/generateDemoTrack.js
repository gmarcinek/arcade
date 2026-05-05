import { createTrackChunkManager } from './trackChunkManager.js';

export function createDemoChunkManager(seed = 42) {
  const mgr = createTrackChunkManager(seed);
  // Pre-generate initial segments
  mgr.update(null, 0);
  return mgr;
}

export function generateDemoTrack(seed = 42) {
  return createDemoChunkManager(seed).trackWorld;
}
