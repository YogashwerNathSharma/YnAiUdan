import { softmax, Tensor } from "./index.js";

export type SamplingOptions = { temperature?: number; topK?: number; topP?: number; seed?: number };

function rng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}

export function sampleToken(logits: Tensor, options: SamplingOptions = {}): number {
  if (logits.length === 0) throw new Error("Cannot sample from empty logits");
  const temperature = Math.max(1e-5, options.temperature ?? 1);
  const values = Array.from(logits.data, value => value / temperature);
  const candidates = values.map((value, id) => ({ id, value })).sort((a, b) => b.value - a.value);
  const topK = Math.max(1, Math.min(candidates.length, options.topK ?? candidates.length));
  let selected = candidates.slice(0, topK);
  let probabilities = softmax(new Tensor(selected.map(item => item.value), [selected.length]));
  if (options.topP !== undefined && options.topP < 1) {
    const kept: typeof selected = [];
    let cumulative = 0;
    for (let i = 0; i < selected.length; i += 1) {
      kept.push(selected[i]!); cumulative += probabilities.data[i]!;
      if (cumulative >= Math.max(0, options.topP)) break;
    }
    selected = kept;
    probabilities = softmax(new Tensor(selected.map(item => item.value), [selected.length]));
  }
  const random = rng(options.seed)();
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    cumulative += probabilities.data[i]!;
    if (random <= cumulative) return selected[i]!.id;
  }
  return selected[selected.length - 1]!.id;
}
