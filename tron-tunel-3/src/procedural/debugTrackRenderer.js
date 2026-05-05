import * as THREE from 'three';
import { getFrame } from './surfaceSegment.js';

const RENDERER_SAMPLES = 200;

/**
 * Renders debug Three.js lines for a TrackWorld:
 *  - WHITE: tube centerline
 *  - ORANGE: safe track center path
 *  - BLUE (×2): safe track left and right edges
 */
export class DebugTrackRenderer {
  constructor(trackWorld) {
    this._trackWorld = trackWorld;
    this._scene = null;
    this.lines = [];
  }

  build(THREE) { // eslint-disable-line no-unused-vars
    this.lines.forEach(l => { if (l.parent) l.parent.remove(l); });
    this.lines = [];
    for (const seg of this._trackWorld.surfaces) {
      this._buildSegmentLines(seg);
    }
    if (this._scene) {
      this.lines.forEach(l => this._scene.add(l));
    }
  }

  rebuild() {
    this.build(THREE);
  }

  _buildSegmentLines(seg) {
    const { safeTracks } = seg;
    const safeTrack = safeTracks[0];

    // --- WHITE centerline ---
    const centerPts = [];
    for (let i = 0; i < RENDERER_SAMPLES; i++) {
      const t = i / (RENDERER_SAMPLES - 1);
      const frame = seg.centerline.getFrameAt(t);
      centerPts.push(frame.position.clone());
    }
    this.lines.push(_makeLine(centerPts, 0xffffff));

    if (!safeTrack) return;

    // --- ORANGE safe track center ---
    const orangePts = [];
    for (let i = 0; i < RENDERER_SAMPLES; i++) {
      const sampleIdx = Math.round((i / (RENDERER_SAMPLES - 1)) * (safeTrack.samples.length - 1));
      const sample = safeTrack.samples[sampleIdx];
      const frame = getFrame(seg, sample.s, sample.u, 0);
      orangePts.push(frame.position.clone());
    }
    this.lines.push(_makeLine(orangePts, 0xff8800));

    // --- BLUE edges ---
    const blueLeftPts = [];
    const blueRightPts = [];
    const radius = seg.radius;
    for (let i = 0; i < RENDERER_SAMPLES; i++) {
      const sampleIdx = Math.round((i / (RENDERER_SAMPLES - 1)) * (safeTrack.samples.length - 1));
      const sample = safeTrack.samples[sampleIdx];
      const halfAngle = sample.width / (2 * radius);
      const frameLeft  = getFrame(seg, sample.s, sample.u - halfAngle, 0);
      const frameRight = getFrame(seg, sample.s, sample.u + halfAngle, 0);
      blueLeftPts.push(frameLeft.position.clone());
      blueRightPts.push(frameRight.position.clone());
    }
    this.lines.push(_makeLine(blueLeftPts,  0x0088ff));
    this.lines.push(_makeLine(blueRightPts, 0x0088ff));
  }

  addToScene(scene) {
    this._scene = scene;
    this.lines.forEach(l => scene.add(l));
  }

  removeFromScene(scene) {
    this.lines.forEach(l => scene.remove(l));
  }

  setVisible(v) {
    this.lines.forEach(l => (l.visible = v));
  }
}

function _makeLine(points, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  return new THREE.Line(geo, mat);
}
