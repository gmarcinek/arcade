import { getFrame as segGetFrame } from './surfaceSegment.js';
import { getSafeInfo as trackGetSafeInfo } from './safeTrack.js';

/**
 * Creates a TrackWorld container with a unified query API.
 * @param {number} seed
 * @param {object[]} surfaces - array of SurfaceSegment objects
 * @returns {object} TrackWorld
 */
export function createTrackWorld(seed, surfaces) {
  const surfaceMap = new Map(surfaces.map(s => [s.id, s]));

  return {
    seed,
    surfaces,

    getFrame(surfaceId, s, u, radialOffset = 0) {
      const seg = surfaceMap.get(surfaceId);
      if (!seg) return null;
      return segGetFrame(seg, s, u, radialOffset);
    },

    getSafeInfo(surfaceId, s, u) {
      const seg = surfaceMap.get(surfaceId);
      if (!seg || seg.safeTracks.length === 0) {
        return { onSafeTrack: false, width: 0, dangerLevel: 1 };
      }

      // Query all safe tracks, return best (nearest center)
      let best = null;
      for (const track of seg.safeTracks) {
        const info = trackGetSafeInfo(track, s, u);
        if (best === null || info.distanceToCenter < best.distanceToCenter) {
          best = info;
          best.nearestTrackId = track.id;
        }
      }
      return best;
    },

    query(surfaceId, s, u) {
      const safeInfo = this.getSafeInfo(surfaceId, s, u);
      return {
        onSafeTrack: safeInfo.onSafeTrack,
        canLand: safeInfo.onSafeTrack,
        inGap: false,
        dangerLevel: safeInfo.dangerLevel,
        nearestTrackId: safeInfo.nearestTrackId || null,
        distanceToSafeCenter: safeInfo.distanceToCenter,
      };
    },

    addSurface(seg) {
      surfaceMap.set(seg.id, seg);
      surfaces.push(seg);
    },

    removeSurface(id) {
      surfaceMap.delete(id);
      const i = surfaces.findIndex(s => s.id === id);
      if (i !== -1) surfaces.splice(i, 1);
    },
  };
}
