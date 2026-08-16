import { deserializeWeights, serializeWeights, type NamedWeight } from "./weights.js";

export type Checkpoint = { version: 1; step: number; loss: number; createdAt: string; weights: NamedWeight[] };

export function createCheckpoint(step: number, loss: number, weights: readonly NamedWeight[]): string {
  const checkpoint: Checkpoint = { version: 1, step, loss, createdAt: new Date().toISOString(), weights: deserializeWeights(serializeWeights(weights)) };
  return JSON.stringify(checkpoint);
}

export function loadCheckpoint(payload: string): Checkpoint {
  const parsed = JSON.parse(payload) as Checkpoint;
  if (parsed.version !== 1 || !Array.isArray(parsed.weights)) throw new Error("Unsupported or invalid checkpoint");
  return { ...parsed, weights: deserializeWeights(JSON.stringify(parsed.weights)) };
}
