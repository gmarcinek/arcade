// Trening sieci jazdy NPC (training-data/*.json → src/ai/model.json).
// Funkcja straty: ważone MSE (skręt, gaz — po tanh) + ważone BCE (hamulec, turbo).
// Wagi próbek:
//  • gracz: nagroda za rozjechanie/trafienie × zanik w czasie (behavioral cloning ważony nagrodą),
//  • NPC:   exp(znormalizowany zwrot) — advantage-weighted regression: jazda, po której NPC
//           zadał obrażenia i sam nie oberwał, waży wiele; rozbicia i śmierć prawie nic.
//
// Użycie: npm run train:ai -- [--epochs 60] [--hidden 48,32] [--lr 0.002] [--npc-weight 1] [--no-legacy]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEATURE_COUNT, ACTION_COUNT, FEATURE_NAMES, ACTION_NAMES, FEATURE_VERSION, DISABLED_FEATURES,
  FOV_HALF, VIEW_DIST, mirrorRow,
} from '../src/ai/features.js';

const ROOT     = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'training-data');
const OUT_FILE = path.join(ROOT, 'src', 'ai', 'model.json');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1] ?? 'true']);
  return acc;
}, []));
const EPOCHS = Number(args.epochs ?? 60);
const HIDDEN = String(args.hidden ?? '48,32').split(',').map(Number);
const LR     = Number(args.lr ?? 0.002);
const NPC_WEIGHT = Number(args['npc-weight'] ?? 1);
const USE_LEGACY = args['no-legacy'] === undefined;
const BATCH  = 128;
const MAX_W  = 8;
const AWR_CLIP = 2.5;  // max odchylenie zwrotu (w std) → waga w zakresie e^±2.5
// Waga składowych straty: steer, throttle (MSE po tanh), brake, boost (BCE)
const LOSS_W = [1.0, 1.0, 0.4, 0.3];

// ── Deterministyczny RNG ──
let _seed = 1234567;
const rand = () => {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ── Dane ──
// v1: 10 promieni (±90/55/30/12/0/180), cel bez widoczności, brak położenia względem grawitacji.
// Przeliczamy na v2 w przybliżeniu: promienie interpolowane, widoczność z FOV/zasięgu, auto w pionie.
const COS_FOV = Math.cos(FOV_HALF);
function migrateV1(r) {
  const o = r.slice(4, 14);
  const rays = [o[0], o[1], o[2], o[3], (o[3] + o[4]) / 2, o[4], (o[4] + o[5]) / 2, o[5], o[6], o[7], o[8], o[9]];
  const tgt = r.slice(14, 20);
  const visible = tgt[1] >= COS_FOV && tgt[2] * 150 <= VIEW_DIST ? 1 : 0;
  return [...r.slice(0, 4), ...rays, ...tgt, visible, visible ? 0 : 0.2, 1, 0, 0, 1, ...r.slice(20)];
}

function loadRows() {
  const out = { player: [], npc: [], files: 0, legacy: 0 };
  if (!fs.existsSync(DATA_DIR)) return out;
  for (const f of fs.readdirSync(DATA_DIR).filter(n => n.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const source = data.source === 'npc' ? 'npc' : 'player';
      let rows = data.rows;
      if (data.featureCount === 20 && USE_LEGACY) {
        rows = rows.filter(r => r.length === 25).map(migrateV1);
        out.legacy += rows.length;
      } else if (data.featureCount !== FEATURE_COUNT) {
        console.warn(`pomijam ${f}: ${data.featureCount} cech zamiast ${FEATURE_COUNT}`);
        continue;
      }
      for (const r of rows) {
        if (r.length !== FEATURE_COUNT + ACTION_COUNT + 1) continue;
        for (const i of DISABLED_FEATURES) r[i] = 0;
        out[source].push(r);
      }
      out.files++;
    } catch (e) {
      console.warn(`pomijam ${f}: ${e.message}`);
    }
  }
  return out;
}

const data = loadRows();
const total = data.player.length + data.npc.length;
if (total < 200) {
  console.error(`Za mało danych: ${total} próbek z ${data.files} plików (potrzeba min. 200).`);
  console.error('Zagraj kilka rund w trybie dev z włączonym nagrywaniem (npm run dev).');
  process.exit(1);
}

// Gracz: wartość = waga nagrody. NPC: wartość = zwrot → exp(z-score).
const weighted = [];
for (const r of data.player) {
  const w = r[r.length - 1];
  if (w > 0) weighted.push([r.slice(0, -1), w]);
}
if (data.npc.length) {
  const R = data.npc.map(r => r[r.length - 1]);
  const mean = R.reduce((s, v) => s + v, 0) / R.length;
  const std = Math.sqrt(R.reduce((s, v) => s + (v - mean) ** 2, 0) / R.length) || 1;
  const rMin = R.reduce((a, v) => Math.min(a, v), Infinity);
  const rMax = R.reduce((a, v) => Math.max(a, v), -Infinity);
  console.log(`NPC zwrot: średnio ${mean.toFixed(2)}, std ${std.toFixed(2)}, min ${rMin.toFixed(2)}, max ${rMax.toFixed(2)}`);
  for (const r of data.npc) {
    const z = Math.max(-AWR_CLIP, Math.min(AWR_CLIP, (r[r.length - 1] - mean) / std));
    weighted.push([r.slice(0, -1), Math.exp(z) * NPC_WEIGHT]);
  }
}

const rows = [];
for (const [base, w] of weighted) rows.push([...base, w], [...mirrorRow(base), w]);
const meanW = rows.reduce((s, r) => s + r[r.length - 1], 0) / rows.length;
for (const r of rows) r[r.length - 1] = Math.min(MAX_W, r[r.length - 1] / meanW);

for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
const nVal  = Math.max(50, Math.floor(rows.length * 0.1));
const val   = rows.slice(0, nVal);
const train = rows.slice(nVal);
const raw = { length: total };
const files = data.files;
console.log(`Dane: gracz ${data.player.length} (w tym ${data.legacy} przeliczonych z v1), NPC ${data.npc.length} z ${files} plików`
  + ` → ${train.length} train / ${val.length} val (z lustrzanym odbiciem)`);

// ── Sieć ──
const sizes = [FEATURE_COUNT, ...HIDDEN, ACTION_COUNT];
const layers = [];
for (let l = 0; l < sizes.length - 1; l++) {
  const inN = sizes[l], outN = sizes[l + 1];
  const lim = Math.sqrt(6 / (inN + outN));
  const W = new Float64Array(inN * outN).map(() => (rand() * 2 - 1) * lim);
  layers.push({
    inN, outN, W, b: new Float64Array(outN),
    gW: new Float64Array(inN * outN), gb: new Float64Array(outN),
    mW: new Float64Array(inN * outN), vW: new Float64Array(inN * outN),
    mb: new Float64Array(outN), vb: new Float64Array(outN),
    a: new Float64Array(outN), d: new Float64Array(outN),
  });
}
const L = layers.length;

function forward(x) {
  let input = x;
  for (let li = 0; li < L; li++) {
    const { inN, outN, W, b, a } = layers[li];
    for (let o = 0; o < outN; o++) {
      let s = b[o];
      const row = o * inN;
      for (let i = 0; i < inN; i++) s += W[row + i] * input[i];
      a[o] = li === L - 1 ? s : Math.tanh(s);
    }
    input = a;
  }
  const z = layers[L - 1].a;
  return [Math.tanh(z[0]), Math.tanh(z[1]), 1 / (1 + Math.exp(-z[2])), 1 / (1 + Math.exp(-z[3]))];
}

// Strata próbki + (opcjonalnie) wypełnienie delt ostatniej warstwy
function sampleLoss(row, fillGrad) {
  const y = forward(row);
  const w = row[row.length - 1];
  const t = row.slice(FEATURE_COUNT, FEATURE_COUNT + ACTION_COUNT);
  const tb = [t[0], Math.max(-1, Math.min(1, t[1])), t[2], t[3]];
  let loss = 0;
  const d = layers[L - 1].d;
  for (let k = 0; k < 2; k++) {
    const e = y[k] - tb[k];
    loss += LOSS_W[k] * e * e;
    if (fillGrad) d[k] = w * LOSS_W[k] * 2 * e * (1 - y[k] * y[k]);
  }
  for (let k = 2; k < 4; k++) {
    const p = Math.min(1 - 1e-7, Math.max(1e-7, y[k]));
    loss += LOSS_W[k] * -(tb[k] * Math.log(p) + (1 - tb[k]) * Math.log(1 - p));
    if (fillGrad) d[k] = w * LOSS_W[k] * (y[k] - tb[k]);
  }
  return w * loss;
}

function backward(x) {
  for (let li = L - 1; li >= 0; li--) {
    const { inN, outN, W, gW, gb, d } = layers[li];
    const input = li === 0 ? x : layers[li - 1].a;
    for (let o = 0; o < outN; o++) {
      gb[o] += d[o];
      const row = o * inN;
      for (let i = 0; i < inN; i++) gW[row + i] += d[o] * input[i];
    }
    if (li > 0) {
      const prev = layers[li - 1];
      for (let i = 0; i < inN; i++) {
        let s = 0;
        for (let o = 0; o < outN; o++) s += W[o * inN + i] * d[o];
        prev.d[i] = s * (1 - prev.a[i] * prev.a[i]);
      }
    }
  }
}

let step = 0;
function adamStep(n) {
  step++;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const c1 = 1 - b1 ** step, c2 = 1 - b2 ** step;
  for (const l of layers) {
    for (const [p, g, m, v] of [[l.W, l.gW, l.mW, l.vW], [l.b, l.gb, l.mb, l.vb]]) {
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] / n;
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        p[i] -= LR * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
        g[i] = 0;
      }
    }
  }
}

const evalLoss = set => set.reduce((s, r) => s + sampleLoss(r, false), 0) / set.length;
const snapshot = () => layers.map(l => ({ W: Array.from(l.W), b: Array.from(l.b) }));

let best = { loss: Infinity, weights: null, epoch: 0 };
for (let ep = 1; ep <= EPOCHS; ep++) {
  for (let i = train.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [train[i], train[j]] = [train[j], train[i]];
  }
  let trainLoss = 0;
  for (let s = 0; s < train.length; s += BATCH) {
    const end = Math.min(train.length, s + BATCH);
    for (let k = s; k < end; k++) {
      trainLoss += sampleLoss(train[k], true);
      backward(train[k]);
    }
    adamStep(end - s);
  }
  trainLoss /= train.length;
  const valLoss = evalLoss(val);
  const mark = valLoss < best.loss ? ' *' : '';
  if (valLoss < best.loss) best = { loss: valLoss, weights: snapshot(), epoch: ep };
  if (ep === 1 || ep % 5 === 0 || mark) {
    console.log(`epoka ${String(ep).padStart(3)}  train ${trainLoss.toFixed(4)}  val ${valLoss.toFixed(4)}${mark}`);
  }
}

const round = v => Math.round(v * 1e5) / 1e5;
const model = {
  version: 1,
  featureCount: FEATURE_COUNT,
  actionCount: ACTION_COUNT,
  featureNames: FEATURE_NAMES,
  actionNames: ACTION_NAMES,
  layers: layers.map((l, i) => ({
    in: l.inN, out: l.outN,
    W: best.weights[i].W.map(round),
    b: best.weights[i].b.map(round),
  })),
  meta: {
    featureVersion: FEATURE_VERSION,
    samples: raw.length,
    playerSamples: data.player.length,
    npcSamples: data.npc.length,
    files,
    hidden: HIDDEN,
    epochs: EPOCHS,
    bestEpoch: best.epoch,
    valLoss: round(best.loss),
    trainedAt: new Date().toISOString(),
  },
};
fs.writeFileSync(OUT_FILE, JSON.stringify(model));
console.log(`Zapisano ${path.relative(ROOT, OUT_FILE)} (najlepsza epoka ${best.epoch}, val ${best.loss.toFixed(4)})`);
