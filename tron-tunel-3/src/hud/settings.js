const STORAGE_KEY = 'tron3_settings';

const _isMobile = window.innerWidth <= 600 || navigator.maxTouchPoints > 1;

const DEFAULTS = {
  targetFps:     0,    // 0 = uncapped
  reflectionRes: 128,
  renderRes:     _isMobile ? 540 : 0,  // mobile: cap at 540p by default
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function initSettingsUI(onResChange) {
  const btn        = document.getElementById('settings-btn');
  const panel      = document.getElementById('settings-panel');
  const fpsSelect  = document.getElementById('set-fps');
  const refSelect  = document.getElementById('set-reflres');
  const resSelect  = document.getElementById('set-renderres');
  const closeBtn   = document.getElementById('settings-close');
  const reloadNote = document.getElementById('settings-reload-note');

  fpsSelect.value = String(settings.targetFps);
  refSelect.value = String(settings.reflectionRes);
  resSelect.value = String(settings.renderRes);

  btn.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  document.addEventListener('pointerdown', e => {
    if (panel.classList.contains('open') &&
        !panel.contains(e.target) &&
        e.target !== btn) {
      panel.classList.remove('open');
    }
  });

  fpsSelect.addEventListener('change', () => {
    settings.targetFps = Number(fpsSelect.value);
    save();
  });

  refSelect.addEventListener('change', () => {
    settings.reflectionRes = Number(refSelect.value);
    save();
    reloadNote.style.display = 'block';
  });

  resSelect.addEventListener('change', () => {
    settings.renderRes = Number(resSelect.value);
    save();
    onResChange?.();
  });
}
