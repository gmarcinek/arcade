import * as THREE from 'three';
import { CAMERA_OFFSET_BEHIND, CAMERA_OFFSET_UP,
         CAMERA_YAW_LERP, CAMERA_POS_LERP, CAMERA_REVERSE_LERP,
         BOOST_CAMERA_DIP } from '../physicsConfig.js';

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera   = camera;
    this._camYaw  = 0;       // aktualny kąt kamery (world Y)
    this._idealPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
  }

  update(carGroup, throttle = 0, boostLevel = 0) {
    const carPos = carGroup.position;

    // Wyciągnij yaw auta z quaternionu
    const q = carGroup.quaternion;
    const carYaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z)
    );

    // Kiedy cofamy — kamera ma być z przodu auta (obrót o PI)
    const targetYaw = throttle < 0 ? carYaw + Math.PI : carYaw;

    // Lerp kąta kamery — interpolacja po okręgu (shortest path)
    let diff = targetYaw - this._camYaw;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const lerpFactor = throttle < 0 ? CAMERA_REVERSE_LERP : CAMERA_YAW_LERP;
    this._camYaw += diff * lerpFactor;

    // Pozycja idealna: ZA autem według kąta kamery (nie kąta auta)
    const sinY = Math.sin(this._camYaw);
    const cosY = Math.cos(this._camYaw);
    const upOffset = CAMERA_OFFSET_UP - BOOST_CAMERA_DIP * boostLevel;
    this._idealPos.set(
      carPos.x - sinY * CAMERA_OFFSET_BEHIND,
      carPos.y + upOffset,
      carPos.z - cosY * CAMERA_OFFSET_BEHIND
    );

    this.camera.position.lerp(this._idealPos, CAMERA_POS_LERP);

    // Patrz na auto (lekko powyżej środka)
    this._lookTarget.set(carPos.x, carPos.y + 1.2, carPos.z);
    this.camera.lookAt(this._lookTarget);
  }
}
