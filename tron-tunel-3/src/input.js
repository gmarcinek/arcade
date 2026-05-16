import { state } from './state.js';

export const input = {
  left:  false,
  right: false,
  up:    false,
  down:  false,
  boost: false,
  jumpConsumed: false,  // legacy / classic mode
  jumpHeld:     false,  // true while Space is held
  jumpReleased: false,  // one-shot: true for one tick when Space is released
  fire: false,
};

// Trzymamy fizyczne kody klawiszy, nie e.key.
// e.code jest stabilniejsze przy wielu klawiszach i różnych layoutach.
const activeCodes = new Set();

const ACTION_CODES = {
  left:  new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  up:    new Set(['ArrowUp', 'KeyW']),
  down:  new Set(['ArrowDown', 'KeyS']),

  // Shift często koliduje przy kilku klawiszach naraz,
  // więc daję też alternatywy: Ctrl / E / Q.
  boost: new Set([
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'KeyE',
    'KeyQ',
  ]),

  jump: new Set(['Space']),
};

const BLOCKED_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'KeyA',
  'KeyD',
  'KeyS',
  'KeyW',
  'KeyE',
  'KeyQ',
]);

function hasAny(codes) {
  for (const code of codes) {
    if (activeCodes.has(code)) return true;
  }
  return false;
}

function syncInputFromKeys() {
  input.left  = hasAny(ACTION_CODES.left);
  input.right = hasAny(ACTION_CODES.right);
  input.up    = hasAny(ACTION_CODES.up);
  input.down  = hasAny(ACTION_CODES.down);
  input.boost = hasAny(ACTION_CODES.boost);

  // Jeżeli oba kierunki są wciśnięte, nie kasuję ich tutaj.
  // Lepiej niech fizyka / sterowanie zdecyduje, czy to neutral,
  // czy ostatni kierunek ma priorytet.
}

function resetInput() {
  activeCodes.clear();

  input.left  = false;
  input.right = false;
  input.up    = false;
  input.down  = false;
  input.boost = false;

  // Nie resetuję jumpConsumed agresywnie, bo zwykle jest konsumowane
  // w logice skoku. Ale przy utracie focusa warto wyczyścić też to.
  input.jumpConsumed = false;
  input.jumpHeld     = false;
  input.jumpReleased = false;
}

export function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (BLOCKED_CODES.has(e.code)) {
      e.preventDefault();
    }

    // Ignorujemy repeat, żeby Space nie spamował skoku.
    // Ale stan trzymanego klawisza i tak zostaje w activeCodes.
    if (e.repeat) return;

    activeCodes.add(e.code);
    syncInputFromKeys();

    if (ACTION_CODES.jump.has(e.code) && state.gameRunning && !state.crashed) {
      input.jumpHeld = true;
    }

    if (e.code === 'KeyF') {
      state.showForces = !state.showForces;
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    if (BLOCKED_CODES.has(e.code)) {
      e.preventDefault();
    }

    activeCodes.delete(e.code);
    syncInputFromKeys();

    if (ACTION_CODES.jump.has(e.code)) {
      if (input.jumpHeld) input.jumpReleased = true;
      input.jumpHeld = false;
    }
  }, { passive: false });

  // Gdy przeglądarka zgubi keyup, np. po zmianie focusa,
  // po puszczeniu Shifta input potrafi zostać w stanie uszkodzonym.
  window.addEventListener('blur', () => {
    resetInput();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetInput();
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.gameRunning && !state.crashed) {
      input.fire = true;
    }
  });
}