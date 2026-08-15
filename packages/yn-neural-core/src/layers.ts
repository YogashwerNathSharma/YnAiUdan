import { Tensor, gelu, rmsNorm, softmax } from "./index.js";

export class Linear {
  constructor(public readonly weight: Tensor, public readonly bias?: Tensor) {
    if (weight.shape.length !== 2) throw new Error("Linear weight must be rank-2");
    if (bias && (bias.shape.length !== 1 || bias.shape[0] !== weight.shape[1])) throw new Error("Linear bias shape mismatch");
  }
  forward(input: Tensor): Tensor {
    const output = input.matmul(this.weight);
    if (!this.bias) return output;
    return output.add(new Tensor(Array.from({ length: output.shape[0] }, (_, row) => this.bias!.data.length === output.shape[1] ? 0 : 0), output.shape));
  }
}

export class Embedding {
  constructor(public readonly weight: Tensor) {
    if (weight.shape.length !== 2) throw new Error("Embedding weight must be rank-2");
  }
  forward(ids: readonly number[]): Tensor {
    const [vocab, dim] = this.weight.shape;
    const out = new Float32Array(ids.length * dim);
    ids.forEach((id, row) => {
      if (!Number.isInteger(id) || id < 0 || id >= vocab) throw new Error(`Token id out of range: ${id}`);
      out.set(this.weight.data.slice(id * dim, (id + 1) * dim), row * dim);
    });
    return new Tensor(out, [ids.length, dim]);
  }
}

export function causalAttention(query: Tensor, key: Tensor, value: Tensor, scale?: number): Tensor {
  if (query.shape.length !== 2 || key.shape.length !== 2 || value.shape.length !== 2) throw new Error("Attention tensors must be rank-2");
  if (query.shape[1] !== key.shape[1] || key.shape[0] !== value.shape[0]) throw new Error("Attention shape mismatch");
  const scores = query.matmul(new Tensor(key.data, [key.shape[1], key.shape[0]])).map((x) => x * (scale ?? 1 / Math.sqrt(query.shape[1])));
  const rows = scores.shape[0];
  const cols = scores.shape[1];
  const masked = new Float32Array(scores.data);
  for (let i = 0; i < rows; i++) for (let j = i + 1; j < cols; j++) masked[i * cols + j] = -Infinity;
  const probabilities = new Float32Array(masked.length);
  for (let i = 0; i < rows; i++) {
    const row = softmax(new Tensor(masked.slice(i * cols, (i + 1) * cols), [cols]));
    probabilities.set(row.data, i * cols);
  }
  return new Tensor(probabilities, [rows, cols]).matmul(value);
}

export class FeedForward {
  constructor(private readonly up: Linear, private readonly down: Linear) {}
  forward(input: Tensor): Tensor { return this.down.forward(gelu(this.up.forward(rmsNorm(input)))); }
}
