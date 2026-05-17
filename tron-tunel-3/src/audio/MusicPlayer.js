import { AudioAnalyzer }    from './AudioAnalyzer.js';
import { AudioMetadataBus } from './AudioMetadataBus.js';

import track00Url from '../assets/music/track_00.MP3?url';
import track01Url from '../assets/music/track_01.MP3?url';

const TRACKS = [track00Url, track01Url];

/**
 * Plays the predefined soundtrack in sequence, routing it through
 * AudioAnalyzer → AudioMetadataBus so shaders react to it.
 * The MediaElementSource is created once; subsequent start() calls
 * just resume / advance the track.
 */
export class MusicPlayer {
  constructor() {
    this._ctx      = null;
    this._audio    = null;
    this._source   = null;
    this._analyzer = null;
    this._idx      = 0;
    this._active   = false;
  }

  async start() {
    if (this._active) return;

    // Create AudioContext lazily (requires prior user gesture)
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }

    // Create audio element + Web Audio graph once
    if (!this._audio) {
      this._audio = new Audio();
      this._audio.crossOrigin = 'anonymous';
      this._source   = this._ctx.createMediaElementSource(this._audio);
      this._analyzer = new AudioAnalyzer(this._ctx, this._source);
      // Audible output
      this._source.connect(this._ctx.destination);
      // Advance to next track when current ends
      this._audio.addEventListener('ended', () => this._next());
    }

    this._audio.src = TRACKS[this._idx];
    try {
      await this._audio.play();
    } catch (e) {
      console.warn('[MusicPlayer] play() blocked:', e.message);
      return;
    }
    this._active = true;
  }

  _next() {
    this._idx = (this._idx + 1) % TRACKS.length;
    this._audio.src = TRACKS[this._idx];
    this._audio.play().catch(() => {});
  }

  stop() {
    if (!this._active) return;
    this._audio?.pause();
    AudioMetadataBus.clear();
    this._active = false;
  }

  /** Resume after a stop() without resetting track position. */
  resume() {
    if (this._active || !this._audio) return;
    this._audio.play().catch(() => {});
    this._active = true;
  }

  tick(dt) {
    if (this._active && this._analyzer) {
      AudioMetadataBus.push(this._analyzer.analyzeFrame(dt));
    }
  }

  get isActive() { return this._active; }
}
