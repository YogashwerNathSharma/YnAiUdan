export type ExplorationDecision = { mode: "EXPLOIT" | "EXPLORE"; probability: number; reason: string };

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Deterministic exploration policy. Randomness is deliberately left to the caller. */
export function decideStrategyExploration(input: { confidence: number; totalObservations: number; requestedRate?: number; hasVerifiedEvidence?: boolean; risk?: "LOW" | "MEDIUM" | "HIGH" }): ExplorationDecision {
  const rate = clamp(input.requestedRate ?? 0.15);
  const uncertainty = 1 - clamp(input.confidence);
  const evidencePenalty = input.hasVerifiedEvidence ? 0 : 0.25;
  const experiencePenalty = Math.min(0.25, input.totalObservations * 0.03);
  const riskPenalty = input.risk === "HIGH" ? 0.35 : input.risk === "MEDIUM" ? 0.15 : 0;
  const probability = clamp(rate * (0.5 + uncertainty * 0.75 + evidencePenalty - experiencePenalty - riskPenalty));
  const mode = input.risk === "HIGH" || probability < 0.05 ? "EXPLOIT" : "EXPLORE";
  return { mode, probability: Number(probability.toFixed(3)), reason: mode === "EXPLORE" ? "Strategy uncertainty justifies a bounded alternative." : "Existing evidence or risk favors the proven strategy." };
}
