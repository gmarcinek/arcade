// Geometry constants for the infinite tunnel mesh.
//
// RING_COUNT  — number of rings (slices along the tunnel) currently allocated.
// RADIAL_SEGS — number of radial subdivisions per ring.
// RING_STEP   — spacing between rings along the spline (world units).
// BEHIND_DIST — how far behind the player the active band starts.
// TOTAL_LEN   — total active band length (RING_COUNT * RING_STEP).
//
// These define the size of the per-frame vertex update window — the mesh is
// re-laid each frame along the player's local stretch of spline.

export const RING_COUNT  = 290;
export const RADIAL_SEGS = 64;
export const RING_STEP   = 2;
export const BEHIND_DIST = 50;
export const TOTAL_LEN   = RING_COUNT * RING_STEP;
