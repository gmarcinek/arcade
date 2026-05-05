import { AudioCapture } from './AudioCapture.js';
import { AudioAnalyzer } from './AudioAnalyzer.js';
import { AudioMetadataBus } from './AudioMetadataBus.js';
import { ShaderAudioBridge } from './ShaderAudioBridge.js';

export { AudioMetadataBus };

export function createAudioSystem() {
  const capture  = new AudioCapture();
  let   analyzer = null;
  const bridge   = new ShaderAudioBridge();
  let   active   = false;

  async function startCapture() {
    const sourceNode = await capture.start();
    analyzer = new AudioAnalyzer(capture.audioContext, sourceNode);
    active = true;
  }

  function stopCapture() {
    capture.stop();
    if (analyzer) { analyzer.dispose(); analyzer = null; }
    AudioMetadataBus.clear();
    active = false;
  }

  function tick(dt) {
    if (active && analyzer) {
      const data = analyzer.analyzeFrame(dt);
      AudioMetadataBus.push(data);
    }
    bridge.tick(dt);
  }

  return {
    startCapture,
    stopCapture,
    tick,
    bridge,
    get isActive() { return active; },
  };
}
