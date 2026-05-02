export function createInput() {
  return {
    left: false,
    right: false,
    boost: false,
    forward: false,
    back: false,
    jump: false,
    jumpConsumed: false,
  };
}

export function bindInput(input, handlers) {
  window.addEventListener("keydown", (e) => {
    if ((e.code === "ArrowLeft" || e.code === "KeyA") && !e.repeat) handlers.onKickflip(-1);
    if ((e.code === "ArrowRight" || e.code === "KeyD") && !e.repeat) handlers.onKickflip(1);

    if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.right = true;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.boost = true;
    if (e.code === "ArrowUp" || e.code === "KeyW") input.forward = true;
    if (e.code === "ArrowDown" || e.code === "KeyS") input.back = true;

    if (e.code === "Space") {
      input.jump = true;
      e.preventDefault();
    }

    if (e.code === "KeyR") handlers.onReset();
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.boost = false;
    if (e.code === "ArrowUp" || e.code === "KeyW") input.forward = false;
    if (e.code === "ArrowDown" || e.code === "KeyS") input.back = false;

    if (e.code === "Space") {
      input.jump = false;
      input.jumpConsumed = false;
    }
  });
}

export function getFrameInput(input) {
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const jumpPressed = input.jump && !input.jumpConsumed;

  if (jumpPressed) {
    input.jumpConsumed = true;
  }

  const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);

  return {
    steer,
    throttle,
    jumpPressed,
    boostHeld: input.boost,
  };
}
