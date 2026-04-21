import * as THREE from 'three';
import { CAMERA_OFFSET_BEHIND, CAMERA_OFFSET_UP,
         CAMERA_YAW_LERP, CAMERA_POS_LERP, CAMERA_REVERSE_LERP,
         CAMERA_YAW_LERP_AIR, CAMERA_POS_LERP_AIR,
         CAMERA_DIR_LERP,
         BOOST_CAMERA_DIP, BOOST_CAMERA_PULLBACK } from '../physicsConfig.js';

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera   = camera;
    this._camYaw  = 0;       // aktualny kąt kamery (world Y)
    this._idealPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._currentLookPos = null; // null = niezainicjalizowany
    this._motionDir = new THREE.Vector3(0, 0, 1);
    this._desiredDir = new THREE.Vector3(0, 0, 1);
  }

  // Wywołaj przed pierwszym update() po kill-cam, żeby nie było skoku
  syncFromKillCam(lookX, lookY, lookZ, playerGroup) {
    if (!this._currentLookPos) this._currentLookPos = new THREE.Vector3();
    this._currentLookPos.set(lookX, lookY, lookZ);
    // Synchronizuj camYaw z aktualnej pozycji kamery względem gracza
    const dx = playerGroup.position.x - this.camera.position.x;
    const dz = playerGroup.position.z - this.camera.position.z;
    this._camYaw = Math.atan2(dx, dz);
    this._velInitialized = false;
  }

  update(carGroup, throttle = 0, boostLevel = 0, distOverride = CAMERA_OFFSET_BEHIND, isAirborne = false, worldVelocity = null, dt = 1 / 60) {
    const carPos = carGroup.position;

    // Yaw auta z quaternionu (potrzebny gdy stoimy)
    const q = carGroup.quaternion;
    const carYaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z)
    );

    const velX = worldVelocity ? worldVelocity.x : 0;
    const velZ = worldVelocity ? worldVelocity.z : 0;
    const speed = Math.hypot(velX, velZ);

    // ── Kierunek ruchu (horągiewka) ──
    // Śledzimy wektor prędkości; przy braku ruchu używamy orientacji auta
    if (speed > 0.35) {
      this._desiredDir.set(velX, 0, velZ).normalize();
    } else {
      const yaw = throttle < 0 ? carYaw + Math.PI : carYaw;
      this._desiredDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    this._motionDir.lerp(this._desiredDir, CAMERA_DIR_LERP).normalize();

    // ── Yaw kamery podąża za kierunkiem ruchu ──
    const targetYaw = Math.atan2(this._motionDir.x, this._motionDir.z);
    let diff = targetYaw - this._camYaw;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const yawLerp = throttle < 0 && speed < 0.75
      ? CAMERA_REVERSE_LERP
      : (isAirborne ? CAMERA_YAW_LERP_AIR : CAMERA_YAW_LERP);
    this._camYaw += diff * yawLerp;

    // ── Pozycja idealna ──
    // Dystans zależy TYLKO od distOverride i boostLevel — żadne klawisze tego nie zmieniają
    const sinY = Math.sin(this._camYaw);
    const cosY = Math.cos(this._camYaw);
    const camDist = distOverride + BOOST_CAMERA_PULLBACK * boostLevel;
    const upOffset = CAMERA_OFFSET_UP - BOOST_CAMERA_DIP * boostLevel;
    this._idealPos.set(
      carPos.x - sinY * camDist,
      carPos.y + upOffset,
      carPos.z - cosY * camDist
    );

    const posLerp = isAirborne ? CAMERA_POS_LERP_AIR : CAMERA_POS_LERP;
    this.camera.position.lerp(this._idealPos, posLerp);

    // ── Look target ── (lekki lead do przodu dla komfortu, nie wpływa na pozycję kamery)
    const lookLead = Math.min(2.0, speed * 0.05);
    this._lookTarget.set(
      carPos.x + this._motionDir.x * lookLead,
      carPos.y + 1.2,
      carPos.z + this._motionDir.z * lookLead
    );
    if (this._currentLookPos) {
      this._currentLookPos.lerp(this._lookTarget, posLerp);
      this.camera.lookAt(this._currentLookPos);
    } else {
      this.camera.lookAt(this._lookTarget);
    }
  }
}
