import * as THREE from 'three';
import { BALL_MAT, BALL_PHYS, CFG, TUNNEL_R, CAR_OFF } from './config.js';
import { state } from './state.js';
import { emitBounce } from './sparks.js';

export function getBasis(theta) {
  return {
    surfaceOut: new THREE.Vector3( Math.sin(theta), -Math.cos(theta), 0),
    up:         new THREE.Vector3(-Math.sin(theta),  Math.cos(theta), 0),
    right:      new THREE.Vector3( Math.cos(theta),  Math.sin(theta), 0),
    forward:    new THREE.Vector3(0, 0, 1),
  };
}

export function createBall(scene) {
  const ballMat = new THREE.MeshStandardMaterial({
    color:           BALL_MAT.color,
    metalness:       BALL_MAT.metalness,
    roughness:       BALL_MAT.roughness,
    envMapIntensity: BALL_MAT.envMapIntensity,
    transparent:     BALL_MAT.transparent,
    opacity:         BALL_MAT.opacity,
    depthWrite:      BALL_MAT.depthWrite,
  });

  const carGroup = new THREE.Group();
  const ball     = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 32), ballMat);
  carGroup.add(ball);

  const ringMat = new THREE.MeshBasicMaterial({
    color:       BALL_MAT.ringColor,
    transparent: true,
    opacity:     BALL_MAT.ringOpacity,
  });
  const equator = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.045, 8, 64), ringMat);
  carGroup.add(equator);

  const flames = [];
  {
    const fGeo = new THREE.ConeGeometry(0.28, 1.8, 10);
    fGeo.rotateX(Math.PI / 2);
    const f = new THREE.Mesh(
      fGeo,
      new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.7 })
    );
    f.position.set(0, 0, -1.4);
    flames.push(f);
    carGroup.add(f);
  }
  scene.add(carGroup);

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(BALL_MAT.reflectionRes, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
  scene.add(cubeCamera);
  ballMat.envMap = cubeRenderTarget.texture;

  const carLight  = new THREE.PointLight(0x80ffff, 2.5, 22);
  const tailLight = new THREE.PointLight(0xff5020, 0.9, 14);
  scene.add(carLight);
  scene.add(tailLight);

  return { carGroup, ball, equator, flames, cubeCamera, ballMat, carLight, tailLight };
}

export function updateCarVisuals(dt, ballObjects, renderer, scene) {
  const { carGroup, ball, equator, flames, cubeCamera, carLight, tailLight } = ballObjects;

  state.frameCount++;
  const basis = getBasis(state.carTheta);
  const r = TUNNEL_R - CAR_OFF - state.radialOffset;

  carGroup.position.set(
    basis.surfaceOut.x * (r - 0.65),
    basis.surfaceOut.y * (r - 0.65),
    state.carZ,
  );

  // Emit sparks on hard bounce (physics sets bounceImpact > 0 this frame)
  if (state.bounceImpact > 0) {
    emitBounce(carGroup.position, basis.surfaceOut, state.speed, state.bounceImpact);
    state.bounceImpact = 0;
  }

  const matrix = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.forward);
  carGroup.quaternion.setFromRotationMatrix(matrix);

  // Rolling spin (r = 0.9 → angular = v/r)
  state.ballSpinAngle += (state.speed / 0.9) * dt;
  const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.ballSpinAngle);
  const leanQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.thetaVelocity * 0.06);
  ball.quaternion.copy(spinQ).multiply(leanQ);

  // Squash/stretch — scaled by materialDamp (0 when S/↓ held)
  state.squashTimer = Math.max(0, state.squashTimer - dt);
  const sq         = state.squashTimer / BALL_PHYS.squashDuration;
  const scaleY     = 1.0 - sq * BALL_PHYS.squashAmount  * state.materialDamp;
  const scaleXZ    = 1.0 + sq * BALL_PHYS.stretchAmount * state.materialDamp;
  const speedStretch = 1.0 + Math.max(0, (state.speed - CFG.baseSpeed) / CFG.baseSpeed)
                             * BALL_PHYS.speedStretch * state.materialDamp;
  ball.scale.set(scaleXZ, scaleY, scaleXZ * speedStretch);
  equator.scale.copy(ball.scale);

  // Tumble on crash
  if (state.crashed) {
    const rollQ  = new THREE.Quaternion().setFromAxisAngle(basis.forward, state.tumbleRollAngle);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(basis.right,   state.tumblePitchAngle);
    carGroup.quaternion.multiply(rollQ).multiply(pitchQ);
  }

  // Equator ring colour: cyan=air, orange=cooldown, green=ready
  const inAir     = !state.grounded && !state.crashed;
  const jumpReady = state.jumpCooldown <= 0;
  equator.material.opacity = inAir
    ? 0.55 + 0.15 * Math.sin(Date.now() * 0.015)
    : (!jumpReady && state.grounded ? 0.45 + 0.25 * Math.sin(Date.now() * 0.008) : 0.15);
  equator.material.color.setHex(
    inAir                          ? 0x80ffff
    : (!jumpReady && state.grounded ? 0xff8800
    :                                 0x00ffcc)
  );

  // Car lights
  carLight.position.set(
    basis.surfaceOut.x * (r - 2),
    basis.surfaceOut.y * (r - 2),
    state.carZ + 1.5,
  );
  carLight.intensity  = state.boostActive ? 3.5 : 2.0;
  tailLight.position.set(basis.surfaceOut.x * r, basis.surfaceOut.y * r, state.carZ - 1.5);
  tailLight.intensity = state.boostActive ? 2.1 : 0.7;

  // Boost flame
  flames.forEach(f => {
    f.visible         = state.boostActive;
    f.scale.z         = (state.boostActive ? 2.0 : 0.0) + Math.random() * 0.25;
    f.material.opacity = 0.85;
    f.material.color.setHex(0x80ffff);
  });

  // Live reflection — update CubeCamera every 10 frames
  if (state.frameCount % 10 === 0) {
    cubeCamera.position.copy(carGroup.position);
    carGroup.visible = false;
    cubeCamera.update(renderer, scene);
    carGroup.visible = true;
  }
}
