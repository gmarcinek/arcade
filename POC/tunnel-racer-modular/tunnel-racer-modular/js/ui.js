export function createUi() {
  return {
    speed: document.getElementById("speed"),
    theta: document.getElementById("theta"),
    thetaVel: document.getElementById("thetaVel"),
    radial: document.getElementById("radial"),
    grounded: document.getElementById("grounded"),
    zpos: document.getElementById("zpos"),
    boostFill: document.getElementById("boostFill"),
    boostText: document.getElementById("boostText"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    trick: document.getElementById("trick"),
    centerNote: document.getElementById("centerNote"),
    centerTimer: null,
  };
}

export function showCenterNote(ui, text) {
  ui.centerNote.textContent = text;
  ui.centerNote.classList.add("visible");

  clearTimeout(ui.centerTimer);
  ui.centerTimer = setTimeout(() => {
    ui.centerNote.classList.remove("visible");
  }, 420);
}

export function updateHud(ui, state) {
  ui.speed.textContent = `${Math.round(state.zVelocity * 3.6)} km/h`;
  ui.theta.textContent = state.theta.toFixed(2);
  ui.thetaVel.textContent = state.thetaVelocity.toFixed(2);
  ui.radial.textContent = state.radialOffset.toFixed(2);
  ui.grounded.textContent = String(state.grounded);
  ui.zpos.textContent = Math.round(state.z).toString();
  ui.boostFill.style.transform = `scaleX(${state.boost.toFixed(3)})`;
  ui.boostText.textContent = `${Math.round(state.boost * 100)}%`;
  ui.score.textContent = Math.round(state.score).toString();
  ui.combo.textContent = `x${state.combo}`;
  ui.trick.textContent = state.lastTrick;
}
