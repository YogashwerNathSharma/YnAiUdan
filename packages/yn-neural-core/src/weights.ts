import { Tensor } from "./index.js";

export type RandomState = { seed: number };

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function xavierUniform(rows: number, cols: number, seed = 42): Tensor {
  if (rows < 1 || cols < 1) throw new Error("Invalid weight dimensions");
  const random = seededRandom(seed);
  const limit = Math.sqrt(6 / (rows + cols));
  const values = new Float32Array(rows * cols);
  for (let i = 0; i < values.length; i++) values[i] = (random() * 2 - 1) * limit;
  return new Tensor(values, [rows, cols]);
}

export function zerosLike(shape: readonly number[]): Tensor { return Tensor.zeros(shape); }

export type NamedWeight = { name: string; tensor: Tensor };

export function serializeWeights(weights: readonly NamedWeight[]): string {
  return JSON.stringify(weights.map(({ name, tensor }) => ({ name, shape: tensor.shape, data: Array.from(tensor.data) })));
}

export function deserializeWeights(payload: string): NamedWeight[] {
  const values: Array<{ name: string; shape: number[]; data: number[] }> = JSON.parse(payload);
  return values.map(value => ({ name: value.name, tensor: new Tensor(value.data, value.shape) }));
}
