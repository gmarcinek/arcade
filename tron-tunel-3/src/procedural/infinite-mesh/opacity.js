import { sourceValue } from './audio-utils.js';
import { TUNNEL_FX_CONFIG } from './config.js';

// Evaluate the current opacity for a named layer, given:
//   audio       — AudioMetadataBus snapshot
//   dt          — frame delta (seconds)
//   opSmooth    — caller-owned dict storing per-layer smoothed values
//   time        — current accumulated time (seconds), for the slow cycle
//
// Behavior:
//   1. Sample the rule's source from audio.
//   2. Target = lerp(min, max, srcVal).
//   3. Exponential smoothing toward target with `smooth` rate.
//   4. Multiply by a per-layer slow sinusoidal gate so layers pulse in/out
//      independently (top 60% of osc = fully on, bottom 40% = off).
//   5. `contact` and `floorEdge` bypass the gate — gameplay-critical layers
//      must never fade off entirely.

export function evalOpacity(name, audio, dt, opSmooth, time) {
  const rule = TUNNEL_FX_CONFIG.opacity[name];
  if (!rule) return 0;

  const srcVal = sourceValue(audio, rule.source);
  const target = rule.min + (rule.max - rule.min) * srcVal;

  const prev = Object.prototype.hasOwnProperty.call(opSmooth, name)
    ? opSmooth[name]
    : target;

  const smooth = rule.smooth ?? 5.0;
  const alpha = 1.0 - Math.exp(-dt * smooth);
  const next = prev + (target - prev) * alpha;
  opSmooth[name] = next;

  // Per-layer slow cycle: each layer pulses in and out independently.
  // Gate goes 0→1 with smoothstep so transitions are soft, not abrupt.
  const period = TUNNEL_FX_CONFIG.layerCyclePeriod ?? 8.0;
  const phase  = rule.phase ?? 0.0;
  const osc    = 0.5 + 0.5 * Math.sin((time * Math.PI * 2.0) / period + phase);
  // Remap so top 60% of osc = fully on, bottom 40% = fully off, smooth blend between.
  const gate   = Math.max(0, Math.min(1, (osc - 0.25) / 0.45));

  // contact and floorEdge are gameplay elements — never fully gated off.
  if (name === 'contact' || name === 'floorEdge') return next;

  return next * gate;
}
