export type DType = "f32" | "f64";

export type TensorShape = readonly number[];

export class Tensor {
  readonly shape: TensorShape;
  readonly data: Float32Array | Float64Array;

  constructor(data: ArrayLike<number>, shape: TensorShape, dtype: DType = "f32") {
    const size = shape.reduce((a, b) => a * b, 1);
    if (size !== data.length) throw new Error(`Tensor data length ${data.length} does not match shape size ${size}`);
    this.shape = [...shape];
    this.data = dtype === "f64" ? new Float64Array(data) : new Float32Array(data);
  }

  static zeros(shape: TensorShape): Tensor {
    const size = shape.reduce((a, b) => a * b, 1);
    return new Tensor(new Float32Array(size), shape);
  }

  static from(values: ArrayLike<number>, shape: TensorShape): Tensor {
    return new Tensor(values, shape);
  }

  get length(): number { return this.data.length; }

  map(fn: (value: number, index: number) => number): Tensor {
    return new Tensor(Array.from(this.data, fn), this.shape);
  }

  add(other: Tensor): Tensor {
    if (this.length !== other.length || this.shape.some((v, i) => v !== other.shape[i])) throw new Error("Tensor shape mismatch");
    return new Tensor(this.data.map((v, i) => v + other.data[i]!), this.shape);
  }

  matmul(other: Tensor): Tensor {
    if (this.shape.length !== 2 || other.shape.length !== 2 || this.shape[1] !== other.shape[0]) throw new Error("matmul requires compatible rank-2 tensors");
    const [m, k] = this.shape;
    const [, n] = other.shape;
    const out = new Float32Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) sum += this.data[i * k + p]! * other.data[p * n + j]!;
      out[i * n + j] = sum;
    }
    return new Tensor(out, [m, n]);
  }
}

export function softmax(input: Tensor): Tensor {
  const max = Math.max(...input.data);
  const exp = Array.from(input.data, value => Math.exp(value - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return new Tensor(exp.map(value => value / sum), input.shape);
}

export function relu(input: Tensor): Tensor {
  return input.map(value => Math.max(0, value));
}

export function gelu(input: Tensor): Tensor {
  return input.map(value => 0.5 * value * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (value + 0.044715 * value ** 3))));
}

export function rmsNorm(input: Tensor, epsilon = 1e-6): Tensor {
  const meanSquare = Array.from(input.data).reduce((sum, value) => sum + value * value, 0) / input.length;
  const scale = 1 / Math.sqrt(meanSquare + epsilon);
  return input.map(value => value * scale);
}
