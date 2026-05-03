import * as THREE from 'three';
import { TUNNEL_R, TUNNEL_LEN, LANE_ANGLE, TUNNEL_FX } from './config.js';
import { tunnelVertexShader, tunnelFragmentShader } from './shaders.js';

// ---- Arc profile: drivable half-angle as function of Z ----
// Ranges from ~4 lanes/side (narrow) to ~60 lanes/side (full)
export function getArcHalfAngle(z) {
  const slow = Math.sin(z * 0.009);
  const med  = Math.sin(z * 0.038) * 0.42;
  const t    = Math.max(0, Math.min(1, (slow + med + 1.42) / 2.84));

  return (4 + t * 56) * LANE_ANGLE;
}

// Geometria jest już obrócona o Math.PI / 2.
// Te wartości są więc ODCHYLENIEM od pozycji standardowej.
const TUNNEL_ROT_POS = Math.PI / 1.9 - Math.PI / 2;
const TUNNEL_ROT_NEG = Math.PI / 2.2 - Math.PI / 2;

// Pełny przebieg: 0 -> max -> min -> 0
const TUNNEL_OSC_DURATION = 3.0;

function easeInOut(t) {
  return t * t * (3.0 - 2.0 * t);
}

function sampleTunnelOscillation(u) {
  // u: 0..1
  // 0.000 -> 0
  // 0.333 -> max
  // 0.666 -> min
  // 1.000 -> 0

  if (u < 1 / 3) {
    const t = easeInOut(u * 3);

    return THREE.MathUtils.lerp(
      0,
      TUNNEL_ROT_POS,
      t
    );
  }

  if (u < 2 / 3) {
    const t = easeInOut((u - 1 / 3) * 3);

    return THREE.MathUtils.lerp(
      TUNNEL_ROT_POS,
      TUNNEL_ROT_NEG,
      t
    );
  }

  const t = easeInOut((u - 2 / 3) * 3);

  return THREE.MathUtils.lerp(
    TUNNEL_ROT_NEG,
    0,
    t
  );
}

export function createTunnel(scene) {
  const tunnelMat = new THREE.ShaderMaterial({
    uniforms: {
      time:        { value: 0 },
      playerZ:     { value: 0 },
      playerTheta: { value: 0 },
      playerLift:  { value: 0 },

      lavaStrength:              { value: TUNNEL_FX.lavaStrength },
      reflectionStrength:        { value: TUNNEL_FX.reflectionStrength },
      reflectionZOffset:         { value: TUNNEL_FX.reflectionZOffset },
      reflectionLiftFadeStart:   { value: TUNNEL_FX.reflectionLiftFadeStart },
      reflectionLiftFadeEnd:     { value: TUNNEL_FX.reflectionLiftFadeEnd },
      reflectionDarken:          { value: TUNNEL_FX.reflectionDarken },
      reflectionTint:            { value: TUNNEL_FX.reflectionTint },
      reflectionHighlight:       { value: TUNNEL_FX.reflectionHighlight },
    },
    vertexShader: tunnelVertexShader,
    fragmentShader: tunnelFragmentShader,
    side: THREE.BackSide,
  });

  const tunnelGeo = new THREE.CylinderGeometry(
    TUNNEL_R,
    TUNNEL_R,
    TUNNEL_LEN,
    80,
    48,
    true
  );

  // Stałe ustawienie cylindra z osi Y na oś Z.
  // Tego nie animujemy.
  tunnelGeo.rotateX(Math.PI / 2);

  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);

  // Start neutralny.
  // Animujemy już tylko odchylenie mesha, nie geometrię.
  tunnel.rotation.x = 0;

  scene.add(tunnel);

  let oscillationActive = false;
  let oscillationTime = 0;

  function startTunnelOscillation() {
    // Nie restartuj co klatkę, gdy gracz dalej jedzie po czarnym polu.
    if (oscillationActive) {
      return;
    }

    oscillationActive = true;
    oscillationTime = 0;
  }

  function resetTunnelOscillation() {
    oscillationActive = false;
    oscillationTime = 0;
    tunnel.rotation.x = 0;
  }

  function updateTunnelOscillation(deltaTime = 1 / 60) {
    if (!oscillationActive) {
      return;
    }

    oscillationTime += deltaTime;

    const u = Math.min(1, oscillationTime / TUNNEL_OSC_DURATION);

    tunnel.rotation.x = sampleTunnelOscillation(u);

    if (u >= 1) {
      oscillationActive = false;
      oscillationTime = 0;
      tunnel.rotation.x = 0;
    }
  }

  return {
    tunnel,
    tunnelMat,
    startTunnelOscillation,
    updateTunnelOscillation,
    resetTunnelOscillation,
  };
}