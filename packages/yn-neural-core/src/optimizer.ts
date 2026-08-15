import { Tensor } from "./index.js";

export type Parameter = { name: string; value: Tensor; grad: Tensor };

export class SGD {
  constructor(public readonly learningRate = 1e-3, public readonly weightDecay = 0) {}

  step(parameters: readonly Parameter[]): void {
    for (const parameter of parameters) {
      if (parameter.value.length !== parameter.grad.length) throw new Error(`Gradient shape mismatch for ${parameter.name}`);
      const next = parameter.value.data.map((value, index) => value - this.learningRate * (parameter.grad.data[index]! + this.weightDecay * value));
      parameter.value.data.set(next);
    }
  }
}

export function zeroGrad(parameters: readonly Parameter[]): void {
  for (const parameter of parameters) parameter.grad.data.fill(0);
}
