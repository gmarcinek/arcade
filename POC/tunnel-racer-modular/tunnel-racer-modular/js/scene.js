import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { CAR_GEOMETRY_CENTER_HEIGHT, CONFIG } from "./config.js";
import { getBasis } from "./math.js";

export function createScene() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07070b, 0.018);

  const camera = new THREE.PerspectiveCamera(
    66,
    window.innerWidth / window.innerHeight,
    0.1,
    1200
  );

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.3);
  mainLight.position.set(2, 5, -6);
  scene.add(mainLight);

  const carLight = new THREE.PointLight(0x45ff9a, 2.0, 18);
  scene.add(carLight);

  const tunnel = createTunnel(CONFIG.tunnelRadius, 900);
  tunnel.position.z = 360;
  scene.add(tunnel);

  const tunnelSkin = createTunnelSkin(CONFIG.tunnelRadius, 900);
  tunnelSkin.position.z = 360;
  scene.add(tunnelSkin);

  const laneGroup = createLaneGroup();
  scene.add(laneGroup);

  const ringGroup = createRingGroup();
  scene.add(ringGroup);

  const car = createDebugCar();
  scene.add(car);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
    })
  );
  scene.add(shadow);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    scene,
    camera,
    car,
    carLight,
    tunnel,
    tunnelSkin,
    laneGroup,
    ringGroup,
    shadow,
  };
}

function createTunnel(radius, length) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 96, 48, true);
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: 0x171925,
    wireframe: true,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.54,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "debug-wireframe-tunnel";
  return mesh;
}

function createTunnelSkin(radius, length) {
  const geometry = new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, length, 96, 1, true);
  geometry.rotateX(Math.PI / 2);

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x080910,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.42,
    })
  );
}

function createLaneGroup() {
  const group = new THREE.Group();

  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * Math.PI * 2;
    const color = i % 3 === 0 ? 0x45ff9a : 0x333a55;
    const width = i % 3 === 0 ? 0.09 : 0.035;
    group.add(createLaneLine(theta, color, width));
  }

  return group;
}

function createLaneLine(theta, color, width = 0.05) {
  const r = CONFIG.tunnelRadius - 0.04;
  const { surfaceOut, up, right, forward } = getBasis(theta);
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward);

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.035, 900),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.74,
    })
  );

  line.position.set(surfaceOut.x * r, surfaceOut.y * r, 360);
  line.quaternion.setFromRotationMatrix(matrix);

  return line;
}

function createRingGroup() {
  const group = new THREE.Group();

  for (let z = 0; z < 900; z += 24) {
    group.add(createRing(z));
  }

  return group;
}

function createRing(z) {
  const curve = new THREE.EllipseCurve(0, 0, CONFIG.tunnelRadius, CONFIG.tunnelRadius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x45ff9a,
    transparent: true,
    opacity: 0.16,
  });

  const line = new THREE.LineLoop(geometry, material);
  line.position.z = z;
  return line;
}

function createDebugCar() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.64, 3.25),
    new THREE.MeshStandardMaterial({
      color: 0x45ff9a,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x062a15,
    })
  );
  body.position.y = 0.52 - CAR_GEOMETRY_CENTER_HEIGHT;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.52, 1.05),
    new THREE.MeshStandardMaterial({
      color: 0xb8ffe0,
      roughness: 0.22,
      metalness: 0.2,
      emissive: 0x0c2c20,
    })
  );
  cabin.position.set(0, 1.04 - CAR_GEOMETRY_CENTER_HEIGHT, -0.18);
  group.add(cabin);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.18, 0.44),
    new THREE.MeshBasicMaterial({ color: 0xd9fff0 })
  );
  nose.position.set(0, 0.76 - CAR_GEOMETRY_CENTER_HEIGHT, 1.68);
  group.add(nose);

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.16, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xff4365 })
  );
  tail.position.set(0, 0.72 - CAR_GEOMETRY_CENTER_HEIGHT, -1.68);
  group.add(tail);

  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x050507,
    roughness: 0.75,
    metalness: 0.15,
  });

  const wheelGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.22, 18);
  wheelGeometry.rotateZ(Math.PI / 2);

  for (const x of [-1.02, 1.02]) {
    for (const z of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, 0.27 - CAR_GEOMETRY_CENTER_HEIGHT, z);
      group.add(wheel);
    }
  }

  const axes = new THREE.AxesHelper(2.6);
  axes.position.y = 0;
  group.add(axes);

  return group;
}

export function updateDebugVisuals(objects, transform, state, input) {
  const { car, carLight, tunnel, tunnelSkin, laneGroup, ringGroup, shadow } = objects;

  car.position.copy(transform.position);
  car.quaternion.copy(transform.quaternion);

  carLight.position
    .copy(transform.position)
    .addScaledVector(transform.up, 2.4)
    .addScaledVector(transform.forward, -1.2);

  carLight.intensity = input.boost && state.boost > 0.02 ? 4.2 : 1.7;

  const groundBasis = getBasis(state.theta);
  const groundPoint = new THREE.Vector3(
    groundBasis.surfaceOut.x * CONFIG.tunnelRadius,
    groundBasis.surfaceOut.y * CONFIG.tunnelRadius,
    state.z
  );

  const shadowMatrix = new THREE.Matrix4().makeBasis(
    groundBasis.right,
    groundBasis.forward,
    groundBasis.up
  );

  shadow.position.copy(groundPoint).addScaledVector(groundBasis.up, 0.012);
  shadow.quaternion.setFromRotationMatrix(shadowMatrix);
  shadow.scale.setScalar(1 + state.radialOffset * 0.08);
  shadow.material.opacity = THREE.MathUtils.clamp(
    0.36 - state.radialOffset * 0.035,
    0.08,
    0.36
  );

  const cycle = Math.floor(state.z / 900);
  const baseZ = cycle * 900;

  tunnel.position.z = baseZ + 360;
  tunnelSkin.position.z = baseZ + 360;
  laneGroup.position.z = baseZ;
  ringGroup.position.z = baseZ;
}
