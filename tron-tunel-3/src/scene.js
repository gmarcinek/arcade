import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({
  canvas:    document.getElementById('game-canvas'),
  antialias: true,
});
// On mobile (small screen or touch-only) cap pixel ratio at 1 to avoid
// rendering a 3× framebuffer (e.g. 1242×2688) on a limited GPU.
const _isMobile = window.innerWidth <= 600 || navigator.maxTouchPoints > 1;
renderer.setPixelRatio(_isMobile ? 1 : Math.min(window.devicePixelRatio, 2));

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040c);
scene.fog        = new THREE.Fog(0x040816, 28, 220);

export const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

export let sceneColorRT = null;

export function createRenderTargets() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  sceneColorRT = new THREE.WebGLRenderTarget(w, h, {
    format:       THREE.RGBAFormat,
    type:         THREE.UnsignedByteType,
    minFilter:    THREE.LinearFilter,
    magFilter:    THREE.LinearFilter,
    depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType),
  });
}
