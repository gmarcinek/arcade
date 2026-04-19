import { CAMERA_LERP } from '../constants.js';

export class CameraSystem {
  update(worldContainer, playerX, playerY, screenW, screenH) {
    const targetX = screenW / 2 - playerX;
    const targetY = screenH / 2 - playerY;
    worldContainer.x += (targetX - worldContainer.x) * CAMERA_LERP;
    worldContainer.y += (targetY - worldContainer.y) * CAMERA_LERP;
  }
}
