// Mała sieć MLP (tanh) uczona skryptem scripts/train-ai.mjs na nagraniach jazdy gracza.
import { FEATURE_COUNT } from './features.js';

const _models = import.meta.glob('./model.json', { eager: true, import: 'default' });
export const TRAINED_MODEL = _models['./model.json'] ?? null;

export class PolicyNet {
  constructor(json) {
    if (json.featureCount !== FEATURE_COUNT) {
      throw new Error(`Model ma ${json.featureCount} cech, gra oczekuje ${FEATURE_COUNT} — wytrenuj ponownie`);
    }
    this.meta = json.meta ?? {};
    this.layers = json.layers.map(l => ({
      inN: l.in, outN: l.out,
      W: Float32Array.from(l.W),
      b: Float32Array.from(l.b),
      a: new Float32Array(l.out),
    }));
  }

  // Zwraca [steer -1..1, throttle -1..1, brake 0..1, boost 0..1]
  predict(x) {
    let input = x;
    const last = this.layers.length - 1;
    for (let li = 0; li <= last; li++) {
      const { inN, outN, W, b, a } = this.layers[li];
      for (let o = 0; o < outN; o++) {
        let s = b[o];
        const row = o * inN;
        for (let i = 0; i < inN; i++) s += W[row + i] * input[i];
        a[o] = li === last ? s : Math.tanh(s);
      }
      input = a;
    }
    const out = this.layers[last].a;
    out[0] = Math.tanh(out[0]);
    out[1] = Math.tanh(out[1]);
    out[2] = 1 / (1 + Math.exp(-out[2]));
    out[3] = 1 / (1 + Math.exp(-out[3]));
    return out;
  }
}
