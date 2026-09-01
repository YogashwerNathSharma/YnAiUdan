import { decideStrategyExploration, type ExplorationDecision } from "./strategy-exploration.js";
import { rankStrategies } from "./strategy-memory.js";

export async function selectStrategy(input: { tenantId: string; userId: string; projectId?: string | null; goal: string; context?: string; risk?: "LOW" | "MEDIUM" | "HIGH"; explorationRate?: number }) {
  const candidates = await rankStrategies({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, goal: input.goal, context: input.context, limit: 5 });
  const best = candidates[0];
  const exploration: ExplorationDecision = decideStrategyExploration({ confidence: best?.confidence ?? 0, totalObservations: (best?.successCount ?? 0) + (best?.failureCount ?? 0), requestedRate: input.explorationRate, hasVerifiedEvidence: Boolean(best?.evidenceBacked), risk: input.risk });
  if (!best) return { selected: null, candidates, exploration: { ...exploration, mode: "EXPLORE" as const, reason: "No verified strategy exists for this context." } };
  return { selected: exploration.mode === "EXPLOIT" ? best : null, candidates, exploration };
}
