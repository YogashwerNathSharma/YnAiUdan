import { softmax, Tensor } from "./index.js";

export function crossEntropy(logits: Tensor, targetIds: readonly number[]): number {
  if (logits.shape.length !== 2 || logits.shape[0] !== targetIds.length) throw new Error("Cross entropy shape mismatch");
  const classes = logits.shape[1];
  let loss = 0;
  for (let row = 0; row < logits.shape[0]; row++) {
    const target = targetIds[row]!;
    if (!Number.isInteger(target) || target < 0 || target >= classes) throw new Error(`Target out of range: ${target}`);
    const probabilities = softmax(new Tensor(logits.data.slice(row * classes, (row + 1) * classes), [classes]));
    loss -= Math.log(Math.max(probabilities.data[target]!, 1e-12));
  }
  return loss / Math.max(targetIds.length, 1);
}

export function perplexity(loss: number): number {
  return Math.exp(Math.min(loss, 50));
}
