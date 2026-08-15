export type GradFn = (gradient: Float32Array) => void;

function zeros(length: number): Float32Array { return new Float32Array(length); }

function assertSameSize(a: Float32Array, b: Float32Array): void {
  if (a.length !== b.length) throw new Error("Autograd tensor size mismatch");
}

export class Variable {
  readonly data: Float32Array;
  readonly grad: Float32Array;
  private readonly parents: readonly Variable[];
  private readonly backwardFn?: GradFn;
  requiresGrad: boolean;

  constructor(data: ArrayLike<number>, requiresGrad = true, parents: readonly Variable[] = [], backwardFn?: GradFn) {
    this.data = new Float32Array(data);
    this.grad = zeros(this.data.length);
    this.requiresGrad = requiresGrad;
    this.parents = parents;
    this.backwardFn = backwardFn;
  }

  static scalar(value: number, requiresGrad = true): Variable { return new Variable([value], requiresGrad); }

  add(other: Variable): Variable {
    assertSameSize(this.data, other.data);
    const out = new Variable(this.data.map((v, i) => v + other.data[i]!), this.requiresGrad || other.requiresGrad, [this, other]);
    out.backwardFn = undefined;
    return withBackward(out, gradient => {
      if (this.requiresGrad) for (let i = 0; i < gradient.length; i++) this.grad[i] += gradient[i]!;
      if (other.requiresGrad) for (let i = 0; i < gradient.length; i++) other.grad[i] += gradient[i]!;
    });
  }

  mul(other: Variable): Variable {
    assertSameSize(this.data, other.data);
    const out = new Variable(this.data.map((v, i) => v * other.data[i]!), this.requiresGrad || other.requiresGrad, [this, other]);
    return withBackward(out, gradient => {
      if (this.requiresGrad) for (let i = 0; i < gradient.length; i++) this.grad[i] += gradient[i]! * other.data[i]!;
      if (other.requiresGrad) for (let i = 0; i < gradient.length; i++) other.grad[i] += gradient[i]! * this.data[i]!;
    });
  }

  sum(): Variable {
    const value = this.data.reduce((a, b) => a + b, 0);
    const out = new Variable([value], this.requiresGrad, [this]);
    return withBackward(out, gradient => {
      if (!this.requiresGrad) return;
      for (let i = 0; i < this.grad.length; i++) this.grad[i] += gradient[0]!;
    });
  }

  relu(): Variable {
    const out = new Variable(this.data.map(v => Math.max(0, v)), this.requiresGrad, [this]);
    return withBackward(out, gradient => {
      if (!this.requiresGrad) return;
      for (let i = 0; i < this.grad.length; i++) this.grad[i] += this.data[i]! > 0 ? gradient[i]! : 0;
    });
  }

  backward(gradient?: ArrayLike<number>): void {
    if (this.data.length !== 1 && !gradient) throw new Error("Non-scalar output requires an explicit gradient");
    const seed = gradient ? new Float32Array(gradient) : new Float32Array([1]);
    if (seed.length !== this.data.length) throw new Error("Backward gradient shape mismatch");
    const topo: Variable[] = [];
    const visited = new Set<Variable>();
    const visit = (node: Variable) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const parent of node.parents) visit(parent);
      topo.push(node);
    };
    visit(this);
    this.grad.set(seed);
    for (let i = topo.length - 1; i >= 0; i--) topo[i]!.backwardFn?.(topo[i]!.grad);
  }

  zeroGrad(): void { this.grad.fill(0); }
}

function withBackward(variable: Variable, fn: GradFn): Variable {
  Object.defineProperty(variable, "backwardFn", { value: fn, writable: false, enumerable: false });
  return variable;
}
