import { AudioCapture }    from './AudioCapture.js';
import { AudioAnalyzer }   from './AudioAnalyzer.js';
import { AudioMetadataBus } from './AudioMetadataBus.js';
import { ShaderAudioBridge } from './ShaderAudioBridge.js';
import { MusicPlayer }     from './MusicPlayer.js';

export { AudioMetadataBus };

export function createAudioSystem() {
  const capture     = new AudioCapture();
  let   analyzer    = null;
  const bridge      = new ShaderAudioBridge();
  const music       = new MusicPlayer();
  let   captureActive = false;

  async function startCapture() {
    music.stop();                         // mute predefined music while reactive
    const sourceNode = await capture.start();
    analyzer = new AudioAnalyzer(capture.audioContext, sourceNode);
    captureActive = true;
  }

  function stopCapture() {
    capture.stop();
    if (analyzer) { analyzer.dispose(); analyzer = null; }
    AudioMetadataBus.clear();
    captureActive = false;
    music.resume();                       // bring back predefined music
  }

  /** Call once on first game start (no-op if capture is active or already playing). */
  async function startMusic() {
    if (!captureActive) await music.start();
  }

  function tick(dt) {
    if (captureActive && analyzer) {
      AudioMetadataBus.push(analyzer.analyzeFrame(dt));
    } else {
      music.tick(dt);
    }
    bridge.tick(dt);
  }

  return {
    startCapture,
    stopCapture,
    startMusic,
    tick,
    bridge,
    get isActive()      { return captureActive; },
    get musicActive()   { return music.isActive; },
  };
}
