import { createCameraController } from "./camera.js";
import { createInput, bindInput, getFrameInput } from "./input.js";
import { createPhysicsController } from "./physics.js";
import { createScene, updateDebugVisuals } from "./scene.js";
import { createState, resetState } from "./state.js";
import { createUi, showCenterNote, updateHud } from "./ui.js";

const state = createState();
const input = createInput();
const ui = createUi();
const objects = createScene();

const cameraController = createCameraController(objects.camera, state, input);

const physics = createPhysicsController(state, {
  showNote: (text) => showCenterNote(ui, text),
  holdCameraTheta: (ms) => cameraController.holdTheta(ms),
});

function resetGame() {
  resetState(state);
  cameraController.reset();
  showCenterNote(ui, "RESET");
}

bindInput(input, {
  onKickflip: (direction) => physics.triggerKickflip(direction),
  onReset: resetGame,
});

let last = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = (now - last) / 1000;
  last = now;

  physics.update(getFrameInput(input), dt);

  const transform = physics.getCarTransform();

  updateDebugVisuals(objects, transform, state, input);
  cameraController.update(transform, dt);
  updateHud(ui, state);

  objects.renderer.render(objects.scene, objects.camera);
}

resetGame();
requestAnimationFrame(animate);
