import { ARENA_W, ARENA_H, WALL_T } from '../constants.js';

export const WALLS = [
  // arena boundaries
  { x: 0,              y: 0,              w: ARENA_W, h: WALL_T },
  { x: 0,              y: ARENA_H - WALL_T, w: ARENA_W, h: WALL_T },
  { x: 0,              y: 0,              w: WALL_T,  h: ARENA_H },
  { x: ARENA_W - WALL_T, y: 0,            w: WALL_T,  h: ARENA_H },
  // internal obstacles
  { x: 400,  y: 400,  w: 120, h: 120 },
  { x: 900,  y: 700,  w: 200, h: 80  },
  { x: 1500, y: 500,  w: 150, h: 150 },
  { x: 600,  y: 1400, w: 100, h: 200 },
  { x: 1200, y: 1200, w: 180, h: 180 },
  { x: 2000, y: 800,  w: 140, h: 100 },
  { x: 1800, y: 1800, w: 200, h: 200 },
];
