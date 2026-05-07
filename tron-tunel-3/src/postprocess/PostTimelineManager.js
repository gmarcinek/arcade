/**
 * PostTimelineManager
 *
 * Plays a sorted list of timed specialEffects events.
 * Supported effects: BW and Invert.
 *
 * Usage:
 *   const mgr = new PostTimelineManager(POST_TIMELINE);
 *   mgr.setPasses({ huePass, bwPass, invertPass });
 *
 *   // in game loop:
 *   mgr.tick(dt);
 *
 *   // restart from beginning:
 *   mgr.reset();
 */
class PostTimelineManager {
  /**
  * @param {Array<{time:number, trigger:string, lerp?:number}>} events
   */
  constructor(events) {
    // Sort ascending by time; keep original index as tiebreaker
    this._events = [...events].sort((a, b) => a.time - b.time);
    this._passes = {};
    this._time = 0;
    this._nextIdx = 0;
    // Active transitions: Map<channel, {setter, from, to, duration, elapsed}>
    this._transitions = new Map();
  }

  /** @param {{ huePass, bwPass, invertPass }} passes */
  setPasses(passes) {
    this._passes = passes;
  }

  /** Advance the timeline by `dt` seconds. Call once per frame. */
  tick(dt) {
    this._time += dt;

    // Fire all events whose time has been crossed
    while (
      this._nextIdx < this._events.length &&
      this._events[this._nextIdx].time <= this._time
    ) {
      this._fire(this._events[this._nextIdx]);
      this._nextIdx++;
    }

    // Advance active lerp transitions
    for (const [channel, tr] of this._transitions) {
      tr.elapsed += dt;
      const t = Math.min(tr.elapsed / tr.duration, 1.0);
      const val = tr.from + (tr.to - tr.from) * t;
      tr.setter(val);
      this._cache = this._cache || {};
      this._cache[channel] = val;
      if (t >= 1.0) {
        this._transitions.delete(channel);
      }
    }

    // Special-effects layer only: keep base contrast from audio, add floors when effects are active.
    this._applySpecialEffectsContrast();
  }

  /** Reset playhead to 0 and mark all events as unfired. */
  reset() {
    this._time = 0;
    this._nextIdx = 0;
    this._transitions.clear();
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  _fire(event) {
    const { trigger, lerp = 0 } = event;
    const { huePass, bwPass, invertPass } = this._passes;

    switch (trigger) {
      case 'startInvert':
        this._transition('invert', v => invertPass?.setIntensity(v),
          this._currentOf('invert', 0), 1.0, lerp);
        break;

      case 'stopInvert':
        this._transition('invert', v => invertPass?.setIntensity(v),
          this._currentOf('invert', 1), 0.0, lerp);
        break;

      case 'startBw':
        this._transition('bw', v => bwPass?.setIntensity(v),
          this._currentOf('bw', 0), 1.0, lerp);
        break;

      case 'stopBw':
        this._transition('bw', v => bwPass?.setIntensity(v),
          this._currentOf('bw', 1), 0.0, lerp);
        break;

      case 'setInvertContrast':
        this._transition('invertContrast', v => invertPass?.setContrast(v),
          this._currentOf('invertContrast', InvertPass.CONFIG?.defaultContrast ?? 1.3), value ?? 1.3, lerp);
        break;

      case 'setInvertBrightness':
        this._transition('invertBrightness', v => invertPass?.setBrightness(v),
          this._currentOf('invertBrightness', 0), value ?? 0, lerp);
        break;

      case 'setInvertMidtonesContrast':
        this._transition('invertMidtonesContrast', v => invertPass?.setMidtonesContrast(v),
          this._currentOf('invertMidtonesContrast', 0), value ?? 0, lerp);
        break;

      default:
        console.warn('[PostTimeline] Unknown trigger:', trigger);
    }

    // keep variable used for lint/readability parity
    void huePass;
  }

  /**
   * Start (or replace) a transition for a named channel.
   * If `duration` is 0, applies instantly.
   */
  _transition(channel, setter, from, to, duration) {
    if (duration <= 0) {
      setter(to);
      // Update current-value cache
      this._transitions.delete(channel);
      this._cache = this._cache || {};
      this._cache[channel] = to;
      return;
    }

    // If a transition is already running for this channel, start from its current value
    const existing = this._transitions.get(channel);
    const startVal = existing
      ? existing.from + (existing.to - existing.from) * Math.min(existing.elapsed / existing.duration, 1.0)
      : from;

    this._transitions.set(channel, { setter, from: startVal, to, duration, elapsed: 0 });
  }

  /**
   * Returns the last known value for a channel (from cache or running transition).
   * Falls back to `defaultVal`.
   */
  _currentOf(channel, defaultVal) {
    const tr = this._transitions.get(channel);
    if (tr) {
      return tr.from + (tr.to - tr.from) * Math.min(tr.elapsed / tr.duration, 1.0);
    }
    return (this._cache && this._cache[channel] !== undefined)
      ? this._cache[channel]
      : defaultVal;
  }

  _applySpecialEffectsContrast() {
    const { huePass } = this._passes;
    if (!huePass) return;

    // BW active → push huePass contrast to at least 1.1
    const bwAmount = this._currentOf('bw', 0.0);
    if (bwAmount > 0.001) {
      const cur = huePass.material?.uniforms?.uContrast?.value ?? 1.0;
      huePass.setContrast(Math.max(cur, 1.1));
    }
    // InvertPass has its own contrast uniform (default 1.3) — managed independently
  }
}

export { PostTimelineManager };
