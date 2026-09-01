import { summarizeTaskTrajectory } from "./trajectory-memory.js";
import { recordLearning } from "./learning-service.js";
import { recordStrategyOutcome } from "./strategy-memory.js";

export async function learnFromCompletedExperience(input: { taskId: string; tenantId: string; userId: string; projectId?: string | null; verified: boolean; evaluationScore: number }) {
  if (!input.verified || input.evaluationScore < 0.75) return { learned: false, reason: "EXPERIENCE_NOT_TRUSTWORTHY" };
  const trajectory = await summarizeTaskTrajectory(input.taskId, input.tenantId, input.userId);
  const successfulSteps = trajectory.events.filter(event => event.status === "COMPLETED" && event.tool);
  if (!successfulSteps.length) return { learned: false, reason: "NO_REUSABLE_SUCCESS" };
  const strategy = successfulSteps.map(event => event.tool).filter(Boolean).join(" → ");
  const lesson = await recordLearning({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? undefined, query: trajectory.goal, kind: "PATTERN", solution: strategy, verification: `Verified completed trajectory; evaluation=${input.evaluationScore.toFixed(3)}; evidence=${trajectory.summary.evidenceCount}`, confidence: Math.min(0.98, 0.75 + input.evaluationScore * 0.2), verified: true });
  await recordStrategyOutcome({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, goal: trajectory.goal, strategy, outcome: "SUCCESS", evidence: `Evaluation ${input.evaluationScore.toFixed(3)}; ${trajectory.summary.completedSteps}/${trajectory.summary.totalSteps} steps completed` });
  return { learned: true, learningId: lesson.id, strategy, trajectory: trajectory.summary };
}
