export type TokenBatch = { inputIds: number[]; targetIds: number[] };

export function createCausalBatches(tokenIds: readonly number[], sequenceLength: number): TokenBatch[] {
  if (sequenceLength < 1) throw new Error("sequenceLength must be positive");
  const batches: TokenBatch[] = [];
  for (let start = 0; start + sequenceLength < tokenIds.length; start += sequenceLength) {
    const inputIds = tokenIds.slice(start, start + sequenceLength);
    const targetIds = tokenIds.slice(start + 1, start + sequenceLength + 1);
    batches.push({ inputIds, targetIds });
  }
  return batches;
}

export function shuffle<T>(items: readonly T[], seed = 42): T[] {
  const output = [...items];
  let state = seed >>> 0;
  for (let i = output.length - 1; i > 0; i--) {
    state = (1664525 * state + 1013904223) >>> 0;
    const j = state % (i + 1);
    [output[i], output[j]] = [output[j]!, output[i]!];
  }
  return output;
}
