import { state } from './state.js';

export const input = {
  left:  false,
  right: false,
  up:    false,
  down:  false,
  boost: false,
  jumpConsumed: false,
};

const keys = {};

export function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Shift',
         'a','A','d','D','s','S','w','W'].includes(e.key)) {
      e.preventDefault();
    }
    if (keys[e.key]) return;
    keys[e.key] = true;

    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') input.up    = true;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') input.down  = true;
    if (e.key === 'Shift') input.boost = true;
    if (e.key === ' ' && state.gameRunning && !state.crashed) input.jumpConsumed = true;
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') input.up    = false;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') input.down  = false;
    if (e.key === 'Shift') input.boost = false;
  });
}
