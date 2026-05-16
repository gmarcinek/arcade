// Pure helpers for sampling AudioMetadataBus values.
//
// sourceValue       — returns a clamped 0..1 reading for a named source.
//                     Resolves a few aliases (bass→low, treble→high, etc).
// signedSourceValue — picks the first finite value from a list of names,
//                     clamped to -1..1. Used for parallax deltaA/deltaS.

export function sourceValue(audio, source) {
  if (!audio) return 0;

  if (source === 'bass') return sourceValue(audio, 'low');
  if (source === 'musicEnergy') return sourceValue(audio, 'rms');
  if (source === 'energy') return sourceValue(audio, 'rms');
  if (source === 'treble') return sourceValue(audio, 'high');

  const raw = audio[source];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw));
  }

  return 0;
}

export function signedSourceValue(audio, names, fallback = 0) {
  if (!audio) return fallback;

  for (const name of names) {
    const raw = audio[name];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(-1, Math.min(1, raw));
    }
  }

  return fallback;
}
