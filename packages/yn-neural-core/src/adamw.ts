import type { Parameter } from "./optimizer.js";

export class AdamW {
  private readonly m = new Map<string, Float32Array>();
  private readonly v = new Map<string, Float32Array>();
  private stepCount = 0;

  constructor(public readonly learningRate = 3e-4, public readonly beta1 = 0.9, public readonly beta2 = 0.999, public readonly epsilon = 1e-8, public readonly weightDecay = 0.01) {}

  step(parameters: readonly Parameter[]): void {
    this.stepCount++;
    const bias1 = 1 - this.beta1 ** this.stepCount;
    const bias2 = 1 - this.beta2 ** this.stepCount;
    for (const parameter of parameters) {
      if (!this.m.has(parameter.name)) {
        this.m.set(parameter.name, new Float32Array(parameter.value.length));
        this.v.set(parameter.name, new Float32Array(parameter.value.length));
      }
      const first = this.m.get(parameter.name)!;
      const second = this.v.get(parameter.name)!;
      for (let i = 0; i < parameter.value.length; i++) {
        const g = parameter.grad.data[i]!;
        first[i] = this.beta1 * first[i]! + (1 - this.beta1) * g;
        second[i] = this.beta2 * second[i]! + (1 - this.beta2) * g * g;
        const mHat = first[i]! / bias1;
        const vHat = second[i]! / bias2;
        parameter.value.data[i] -= this.learningRate * (mHat / (Math.sqrt(vHat) + this.epsilon) + this.weightDecay * parameter.value.data[i]!);
      }
    }
  }
}
