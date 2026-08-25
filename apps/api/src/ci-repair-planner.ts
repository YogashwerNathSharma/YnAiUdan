import { z } from "zod";
import { analyzeCiFailure, type CiJob } from "./ci-failure-analyzer.js";

export const repairPlanSchema = z.object({
  category: z.string(),
  confidence: z.number(),
  nextAction: z.string(),
  safeToAutoRepair: z.boolean(),
  requiresHumanApproval: z.boolean(),
  steps: z.array(z.string()),
  guardrails: z.array(z.string())
});
export type CiRepairPlan = z.infer<typeof repairPlanSchema>;

export function buildCiRepairPlan(input: { jobs: CiJob[]; log?: string }): CiRepairPlan {
  const analysis = analyzeCiFailure(input);
  const common = ["Preserve the current repository state", "Inspect the smallest relevant change surface", "Do not modify unrelated files", "Run typecheck, build and tests after any patch"];
  if (analysis.category === "CI_INFRA") return { category: analysis.category, confidence: analysis.confidence, nextAction: analysis.nextAction, safeToAutoRepair: false, requiresHumanApproval: true, steps: [analysis.recommendation, "Inspect the failed GitHub Action and runner configuration", "Re-run CI without changing application code"], guardrails: [...common, "Never rewrite application code to compensate for a runner/setup failure"] };
  if (analysis.category === "UNKNOWN") return { category: analysis.category, confidence: analysis.confidence, nextAction: analysis.nextAction, safeToAutoRepair: false, requiresHumanApproval: true, steps: [analysis.recommendation, "Collect the failed check-run/job log", "Classify the failure before generating a patch"], guardrails: common };
  return { category: analysis.category, confidence: analysis.confidence, nextAction: analysis.nextAction, safeToAutoRepair: analysis.repairable && analysis.confidence >= 0.85, requiresHumanApproval: true, steps: [analysis.recommendation, "Locate the exact source or test failure", "Generate the minimum patch", "Run targeted verification", "Run the full CI validation"], guardrails: [...common, "Never auto-merge a repair", "Stop after three failed repair attempts"] };
}
