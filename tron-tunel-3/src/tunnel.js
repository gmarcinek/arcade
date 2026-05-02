import * as THREE from 'three';
import { TUNNEL_R, TUNNEL_LEN, LANE_ANGLE } from './config.js';
import { tunnelVertexShader, tunnelFragmentShader } from './shaders.js';

// ---- Arc profile: drivable half-angle as function of Z ----
// Ranges from ~4 lanes/side (narrow) to ~60 lanes/side (full)
export function getArcHalfAngle(z) {
  const slow = Math.sin(z * 0.009);
  const med  = Math.sin(z * 0.038) * 0.42;
  const t    = Math.max(0, Math.min(1, (slow + med + 1.42) / 2.84));
  return (4 + t * 56) * LANE_ANGLE;
}

export function createTunnel(scene) {
  const tunnelMat = new THREE.ShaderMaterial({
    uniforms: {
      time:    { value: 0 },
      playerZ: { value: 0 },
    },
    vertexShader:   tunnelVertexShader,
    fragmentShader: tunnelFragmentShader,
    side: THREE.BackSide,
  });

  const tunnelGeo = new THREE.CylinderGeometry(TUNNEL_R, TUNNEL_R, TUNNEL_LEN, 80, 48, true);
  tunnelGeo.rotateX(Math.PI / 2);
  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
  scene.add(tunnel);

  return { tunnel, tunnelMat };
}
