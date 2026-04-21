import * as THREE from 'three';
import { CAMERA_OFFSET_BEHIND, CAMERA_OFFSET_UP,
         CAMERA_YAW_LERP, CAMERA_POS_LERP, CAMERA_REVERSE_LERP,
         CAMERA_YAW_LERP_AIR, CAMERA_POS_LERP_AIR,
         BOOST_CAMERA_DIP } from '../physicsConfig.js';

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera   = camera;
    this._camYaw  = 0;       // aktualny kąt kamery (world Y)
    this._idealPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._currentLookPos = null; // null = niezainicjalizowany
  }

  // Wywołaj przed pierwszym update() po kill-cam, żeby nie było skoku
  syncFromKillCam(lookX, lookY, lookZ, playerGroup) {
    if (!this._currentLookPos) this._currentLookPos = new THREE.Vector3();
    this._currentLookPos.set(lookX, lookY, lookZ);
    // Synchronizuj camYaw z aktualnej pozycji kamery względem gracza
    const dx = playerGroup.position.x - this.camera.position.x;
    const dz = playerGroup.position.z - this.camera.position.z;
    this._camYaw = Math.atan2(dx, dz);
  }

  update(carGroup, throttle = 0, boostLevel = 0, distOverride = CAMERA_OFFSET_BEHIND, isAirborne = false) {
    const carPos = carGroup.position;

    // Wyciągnij yaw auta z quaternionu
    const q = carGroup.quaternion;
    const carYaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z)
    );

    // Kiedy cofamy — kamera ma być z przodu auta (obrót o PI)
    const targetYaw = throttle < 0 ? carYaw + Math.PI : carYaw;

    // Lerp kąta kamery — wolniejszy gdy auto jest w powietrzu (unika szaleństwa przy obrocie)
    let diff = targetYaw - this._camYaw;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const yawLerp = throttle < 0 ? CAMERA_REVERSE_LERP
                  : isAirborne   ? CAMERA_YAW_LERP_AIR
                  : CAMERA_YAW_LERP;
    this._camYaw += diff * yawLerp;

    // Pozycja idealna: ZA autem według kąta kamery (nie kąta auta)
    const sinY = Math.sin(this._camYaw);
    const cosY = Math.cos(this._camYaw);
    const upOffset = CAMERA_OFFSET_UP - BOOST_CAMERA_DIP * boostLevel;
    this._idealPos.set(
      carPos.x - sinY * distOverride,
      carPos.y + upOffset,
      carPos.z - cosY * distOverride
    );

    const posLerp = isAirborne ? CAMERA_POS_LERP_AIR : CAMERA_POS_LERP;
    this.camera.position.lerp(this._idealPos, posLerp);

    // Patrz na auto — z lerpem jeśli _currentLookPos jest zainicjalizowany
    this._lookTarget.set(carPos.x, carPos.y + 1.2, carPos.z);
    if (this._currentLookPos) {
      this._currentLookPos.lerp(this._lookTarget, posLerp);
      this.camera.lookAt(this._currentLookPos);
    } else {
      this.camera.lookAt(this._lookTarget);
    }
  }
}
