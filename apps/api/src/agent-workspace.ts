import type { ProjectConstitution } from "./project-constitution.js";
import type { ProjectIntelligenceGraph } from "./project-intelligence-graph.js";
import type { ProductBuildPlan } from "./requirement-compiler.js";
import type { BuildWorkItem } from "./build-orchestrator.js";
import type { RoutedWorkItem } from "./capability-agent-router.js";

export type AgentWorkspace = {
  projectId: string;
  agent: RoutedWorkItem["agent"];
  workItem: BuildWorkItem;
  constitution: ProjectConstitution;
  graph: ProjectIntelligenceGraph;
  buildPlan: ProductBuildPlan;
  constraints: string[];
  requiredOutputs: Array<"ARTIFACT" | "TESTS" | "EVIDENCE" | "ARCHITECTURE_CHANGE" | "CHANGE_LEDGER">;
};

export function createAgentWorkspace(input: Omit<AgentWorkspace, "requiredOutputs"> & { requiredOutputs?: AgentWorkspace["requiredOutputs"] }): AgentWorkspace {
  return {
    ...input,
    requiredOutputs: input.requiredOutputs ?? ["ARTIFACT", "TESTS", "EVIDENCE", "ARCHITECTURE_CHANGE", "CHANGE_LEDGER"],
  };
}

export function validateAgentWorkspace(workspace: AgentWorkspace): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (workspace.workItem.projectId !== workspace.projectId) reasons.push("WORK_ITEM_PROJECT_MISMATCH");
  if (workspace.graph.projectId !== workspace.projectId) reasons.push("GRAPH_PROJECT_MISMATCH");
  if (workspace.buildPlan.projectId !== workspace.projectId) reasons.push("BUILD_PLAN_PROJECT_MISMATCH");
  if (!workspace.constitution.projectId || workspace.constitution.projectId !== workspace.projectId) reasons.push("CONSTITUTION_PROJECT_MISMATCH");
  if (!workspace.requiredOutputs.length) reasons.push("NO_REQUIRED_OUTPUTS");
  return { valid: reasons.length === 0, reasons };
}
