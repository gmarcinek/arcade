/**
 * CameraController — wirtualna + realna kamera z systemem stanów.
 *
 * Architektura:
 *  - Każdy stan (PLAYER, NPC_DESTROY) oblicza swój idealny cel (pos, lookAt, fov).
 *  - "Wirtualna kamera" lerpuje między poprzednim a aktualnym stanem w ciągu
 *    STATE_BLEND sekund — dając płynne przejścia bez twardych przeskoków.
 *  - "Realna kamera" (THREE.PerspectiveCamera) powoli dąży do wirtualnej
 *    z własnym lerpem, dając kinowy lag.
 */
import * as THREE from 'three';
import {
  CAMERA_OFFSET_BEHIND, CAMERA_OFFSET_UP,
  CAMERA_YAW_LERP, CAMERA_POS_LERP, CAMERA_REVERSE_LERP,
  CAMERA_YAW_LERP_AIR, CAMERA_POS_LERP_AIR, CAMERA_DIR_LERP,
  BOOST_CAMERA_DIP, BOOST_CAMERA_PULLBACK,
  BOOST_FOV_NORMAL, BOOST_FOV_ACTIVE,
} from '../physicsConfig.js';

// ── Stałe orbity kill-cam ─────────────────────────────────────────
const ORBIT_DIST   = 20;   // [m]
const ORBIT_HEIGHT = 3.5;  // [m]
const ORBIT_SPEED  = 0.45; // [rad/s]
const ORBIT_FOV    = 90;   // [deg]

// ── Czas przejścia między stanami ─────────────────────────────────
const STATE_BLEND = 0.5;   // [s]

// Tymczasowe obiekty (unikamy alokacji per-frame)
const _toPos  = new THREE.Vector3();
const _toLook = new THREE.Vector3();

function smoothStep(t) { return t * t * (3 - 2 * t); }

// ─────────────────────────────────────────────────────────────────
export const CamState = Object.freeze({
  PLAYER:      'PLAYER',
  NPC_DESTROY: 'NPC_DESTROY',
});

export class CameraController {
  constructor(camera) {
    this._cam = camera;

    // ── Wirtualna kamera (blendowany cel) ────────────────────────
    this._vPos  = new THREE.Vector3().copy(camera.position);
    this._vLook = new THREE.Vector3(0, 1.2, 5);
    this._vFov  = camera.fov;

    // ── Realna kamera — śledzi wirtualną ─────────────────────────
    this._rLook = null;          // lazy-init przy pierwszym update

    // ── Maszyna stanów ───────────────────────────────────────────
    this._state  = CamState.PLAYER;
    this._blendT = 1.0;           // 1 = w pełni w aktualnym stanie

    // Zamrożone wyjście poprzedniego stanu (źródło blendu)
    this._fromPos  = new THREE.Vector3().copy(camera.position);
    this._fromLook = new THREE.Vector3(0, 1.2, 5);
    this._fromFov  = camera.fov;

    // ── Stan PLAYER — logika horągiewki ──────────────────────────
    this._camYaw    = 0;
    this._motionDir = new THREE.Vector3(0, 0, 1);
    this._desDir    = new THREE.Vector3(0, 0, 1);

    // ── Stan NPC_DESTROY — orbit ─────────────────────────────────
    this._orbitTarget = null;  // THREE.Group
    this._orbitAngle  = 0;
  }

  /**
   * Przełącz stan kamery.
   * @param {string} state  CamState.PLAYER | CamState.NPC_DESTROY
   * @param {object} opts   NPC_DESTROY: { target: THREE.Group, startAngle?: number }
   */
  setState(state, opts = {}) {
    if (this._state === state) return;

    // Zamroź obecne wyjście wirtualnej kamery jako "skąd"
    this._fromPos.copy(this._vPos);
    this._fromLook.copy(this._vLook);
    this._fromFov  = this._vFov;
    this._blendT   = 0.0;
    this._state    = state;

    if (state === CamState.NPC_DESTROY) {
      this._orbitTarget = opts.target || null;
      this._orbitAngle  = opts.startAngle || 0;
    }
  }

  /**
   * Główny update — wywołuj raz na klatkę.
   * @param {number}   dt
   * @param {object}   playerCtx  { group, throttle, boostLevel, velocity, isAirborne }
   */
  update(dt, playerCtx) {
    // 1. Oblicz cel aktualnego stanu
    let toFov;
    if (this._state === CamState.PLAYER) {
      toFov = this._computePlayer(dt, playerCtx, _toPos, _toLook);
    } else {
      toFov = this._computeOrbit(dt, _toPos, _toLook);
    }

    // 2. Przesuń blend t
    this._blendT = Math.min(1.0, this._blendT + dt / STATE_BLEND);
    const t = smoothStep(this._blendT);

    // 3. Blend wirtualnej kamery (from → to)
    this._vPos.lerpVectors(this._fromPos, _toPos, t);
    this._vLook.lerpVectors(this._fromLook, _toLook, t);
    this._vFov = this._fromFov + (toFov - this._fromFov) * t;

    // 4. Realna kamera płynnie dąży do wirtualnej
    const posLerp = this._state === CamState.NPC_DESTROY
      ? CAMERA_POS_LERP_AIR   // celowo wolniejszy ruch przy orbicie
      : CAMERA_POS_LERP;

    this._cam.position.lerp(this._vPos, posLerp);

    if (!this._rLook) this._rLook = this._vLook.clone();
    this._rLook.lerp(this._vLook, posLerp);
    this._cam.lookAt(this._rLook);

    this._cam.fov += (this._vFov - this._cam.fov) * 0.1;
    this._cam.updateProjectionMatrix();
  }

  // ── Prywatne: stan PLAYER ────────────────────────────────────────
  _computePlayer(dt, ctx, outPos, outLook) {
    const { group, throttle = 0, boostLevel = 0, velocity = null, isAirborne = false } = ctx;
    const carPos = group.position;

    // Yaw z quaternionu
    const q = group.quaternion;
    const carYaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z),
    );

    const velX = velocity ? velocity.x : 0;
    const velZ = velocity ? velocity.z : 0;
    const speed = Math.hypot(velX, velZ);

    // Kierunek ruchu (horągiewka)
    if (speed > 0.35) {
      this._desDir.set(velX, 0, velZ).normalize();
    } else {
      const yaw = throttle < 0 ? carYaw + Math.PI : carYaw;
      this._desDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    this._motionDir.lerp(this._desDir, CAMERA_DIR_LERP).normalize();

    // Yaw kamery dąży za kierunkiem ruchu
    const targetYaw = Math.atan2(this._motionDir.x, this._motionDir.z);
    let diff = targetYaw - this._camYaw;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const yawLerp = throttle < 0 && speed < 0.75
      ? CAMERA_REVERSE_LERP
      : (isAirborne ? CAMERA_YAW_LERP_AIR : CAMERA_YAW_LERP);
    this._camYaw += diff * yawLerp;

    // Pozycja — dystans zmienia TYLKO boost, nie klawisze
    const camDist  = CAMERA_OFFSET_BEHIND + BOOST_CAMERA_PULLBACK * boostLevel;
    const upOffset = CAMERA_OFFSET_UP - BOOST_CAMERA_DIP * boostLevel;
    outPos.set(
      carPos.x - Math.sin(this._camYaw) * camDist,
      carPos.y + upOffset,
      carPos.z - Math.cos(this._camYaw) * camDist,
    );

    // Look target z lekkim lead
    const lookLead = Math.min(2.0, speed * 0.05);
    outLook.set(
      carPos.x + this._motionDir.x * lookLead,
      carPos.y + 1.2,
      carPos.z + this._motionDir.z * lookLead,
    );

    return BOOST_FOV_NORMAL + (BOOST_FOV_ACTIVE - BOOST_FOV_NORMAL) * boostLevel;
  }

  // ── Prywatne: stan NPC_DESTROY ────────────────────────────────────
  _computeOrbit(dt, outPos, outLook) {
    this._orbitAngle += ORBIT_SPEED * dt;

    if (!this._orbitTarget) {
      // Brak celu — trzymaj ostatnią wirtualną pozycję
      outPos.copy(this._vPos);
      outLook.copy(this._vLook);
      return ORBIT_FOV;
    }

    const tp = this._orbitTarget.position;
    outPos.set(
      tp.x - Math.sin(this._orbitAngle) * ORBIT_DIST,
      tp.y + ORBIT_HEIGHT,
      tp.z - Math.cos(this._orbitAngle) * ORBIT_DIST,
    );
    outLook.set(tp.x, tp.y + 1.2, tp.z);
    return ORBIT_FOV;
  }
}
