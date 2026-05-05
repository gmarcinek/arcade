export const AudioMetadataBus = {
  current: null,  // null when no audio active

  push(data) { this.current = data; },
  clear() { this.current = null; },

  get() { return this.current || AudioMetadataBus.ZERO; },
};

AudioMetadataBus.ZERO = {
  sub: 0, low: 0, mid: 0, high: 0, rms: 0,
  bassImpact: 0, midWave: 0, lavaLight: 0, ribbonDrive: 0,
  beatPulse: 0, onsetPulse: 0, isOnset: false,
  bpm: 0,
  chroma: [0, 0, 0],
};
