import type { ProductBuildPlan } from "./requirement-compiler.js";

export type BuildWorkItem = { id: string; requirementId: string; capability: string; platform: string; dependsOn: string[]; status: "PENDING" | "READY" };
export type BuildOrchestrationPlan = { projectId: string; phase: "DISCOVERY" | "BUILD" | "VERIFY"; workItems: BuildWorkItem[]; blockers: string[] };

export function createBuildOrchestrationPlan(plan: ProductBuildPlan): BuildOrchestrationPlan {
  const blockers = [...plan.missingDecisions];
  const workItems: BuildWorkItem[] = [];
  for (const requirement of plan.requirements) {
    for (const capability of requirement.capabilities) {
      for (const platform of requirement.platforms) {
        const id = `${requirement.id}:${platform}:${capability.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
        const dependencies = workItems.filter(item => item.requirementId === requirement.id).map(item => item.id);
        workItems.push({ id, requirementId: requirement.id, capability, platform, dependsOn: dependencies, status: blockers.length ? "PENDING" : "READY" });
      }
    }
  }
  return { projectId: plan.projectId, phase: blockers.length ? "DISCOVERY" : "BUILD", workItems, blockers };
}

export function advanceBuildPhase(plan: BuildOrchestrationPlan, resolvedBlockers: string[] = []): BuildOrchestrationPlan {
  const remaining = plan.blockers.filter(blocker => !resolvedBlockers.includes(blocker));
  if (remaining.length) return { ...plan, phase: "DISCOVERY", blockers: remaining, workItems: plan.workItems.map(item => ({ ...item, status: "PENDING" })) };
  return { ...plan, phase: plan.workItems.every(item => item.status === "READY") ? "BUILD" : "VERIFY", blockers: [], workItems: plan.workItems.map(item => ({ ...item, status: "READY" })) };
}
