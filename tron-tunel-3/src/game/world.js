import * as THREE from 'three';
import { scene } from '../scene.js';
import { createBackgroundLayer }                         from '../procedural/shadders/background/background.glsl.js';
import { createBall }                                    from '../ball.js';
import { createAudioSystem }                             from '../audio/index.js';
import { createSparks, createDebris }                    from '../sparks.js';
import { createDemoChunkManager }                        from '../procedural/generateDemoTrack.js';
import { DebugTrackRenderer }                            from '../procedural/debugTrackRenderer.js';
import { createInfiniteSpline }                          from '../procedural/infiniteSpline.js';
import { InfiniteMesh }                                  from '../procedural/infiniteMesh.js';
import { createCrossSection }                            from '../procedural/crossSection.js';

function bitrev32(n) {
  n = n >>> 0;
  n = ((n & 0x55555555) <<  1) | ((n >>>  1) & 0x55555555);
  n = ((n & 0x33333333) <<  2) | ((n >>>  2) & 0x33333333);
  n = ((n & 0x0f0f0f0f) <<  4) | ((n >>>  4) & 0x0f0f0f0f);
  n = ((n & 0x00ff00ff) <<  8) | ((n >>>  8) & 0x00ff00ff);
  n = ((n << 16) | (n >>> 16)) >>> 0;
  return n;
}

export const PROCEDURAL_DEBUG  = false;
export const PROCEDURAL_PLAYER = true;

// ---- Background ----
export const backgroundLayer = createBackgroundLayer(scene);

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0x6090ff, 0x281410, 0.55));
scene.add(new THREE.PointLight(0x0080ff, 2.5, 40));
{
  const l = new THREE.PointLight(0xff4000, 1.8, 35);
  l.position.set(8, -8, 0);
  scene.add(l);
}

// ---- Ball / car ----
export const ballObjects     = createBall(scene);
export const { carGroup }    = ballObjects;

// ---- Audio ----
export const audioSystem = createAudioSystem();
audioSystem.bridge.register(backgroundLayer.material);

// ---- Effects ----
createSparks(scene);
createDebris(scene);

// ---- Procedural track ----
export const chunkManager = createDemoChunkManager(42);
export const demoTrack    = chunkManager.trackWorld;

export let debugRenderer = null;
if (PROCEDURAL_DEBUG) {
  debugRenderer = new DebugTrackRenderer(demoTrack);
  debugRenderer.build(THREE);
  debugRenderer.addToScene(scene);
}

// ---- Infinite spline + mesh ----
export let infiniteSpline  = null;
export let infiniteMeshObj = null;
export let crossSection    = null;

export function resetSpline() {
  infiniteSpline = createInfiniteSpline(bitrev32(Date.now()));
  infiniteSpline.extend(800);
  if (infiniteMeshObj) infiniteMeshObj.setSpline(infiniteSpline);
}

if (PROCEDURAL_PLAYER) {
  infiniteSpline = createInfiniteSpline(bitrev32(Date.now()));
  infiniteSpline.extend(800);
  crossSection   = createCrossSection();
  infiniteMeshObj = new InfiniteMesh(scene, infiniteSpline, crossSection);
  audioSystem.bridge.register(infiniteMeshObj.material);
}
