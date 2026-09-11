import { appendExecutionEvidence } from "./universal-execution-ledger.js";
import { buildAgentAssignments, createAgentEnvelope, type AgentEnvelope, type AgentAssignment } from "./agent-fabric.js";
import type { UniversalPlan } from "./universal-intelligence.js";

export type FederationWave = {
  wave: number;
  assignments: AgentAssignment[];
  parallel: boolean;
};

export type FederationPlan = {
  taskId: string;
  tenantId: string;
  goal: string;
  waves: FederationWave[];
  agents: string[];
  maxParallelAgents: number;
};

export function buildFederationPlan(taskId: string, tenantId: string, goal: string, plan: UniversalPlan, maxParallelAgents = 4): FederationPlan {
  const assignments = buildAgentAssignments(plan.workItems);
  const byId = new Map(assignments.map(item => [item.workItemId, item]));
  const waves: FederationWave[] = plan.executionWaves.map((wave, index) => {
    const items = wave.map(id => byId.get(id)).filter((item): item is AgentAssignment => Boolean(item));
    return { wave: index + 1, assignments: items, parallel: items.length > 1 };
  }).filter(wave => wave.assignments.length > 0);
  return {
    taskId,
    tenantId,
    goal,
    waves,
    agents: [...new Set(assignments.map(item => item.agent))],
    maxParallelAgents: Math.max(1, Math.min(maxParallelAgents, 16)),
  };
}

export function materializeAgentEnvelopes(input: { taskId: string; tenantId: string; goal: string; wave: FederationWave; inputs?: Record<string, Record<string, unknown>> }): AgentEnvelope[] {
  return input.wave.assignments.slice(0, 16).map(assignment => createAgentEnvelope({
    taskId: input.taskId,
    tenantId: input.tenantId,
    workItemId: assignment.workItemId,
    agent: assignment.agent,
    goal: input.goal,
    input: input.inputs?.[assignment.workItemId] ?? {},
    evidence: { expectedArtifacts: assignment.expectedArtifacts, dependsOn: assignment.dependsOn, parallelGroup: assignment.parallelGroup },
  }));
}

export async function recordFederationStart(plan: FederationPlan): Promise<void> {
  await appendExecutionEvidence(plan.taskId, plan.tenantId, {
    kind: "AGENT_ASSIGNED",
    actor: "SYSTEM",
    summary: `Agent federation initialized with ${plan.agents.length} specialist agents`,
    data: { agents: plan.agents, waves: plan.waves.map(wave => ({ wave: wave.wave, assignments: wave.assignments.map(item => item.workItemId), parallel: wave.parallel })), maxParallelAgents: plan.maxParallelAgents },
  });
}

export async function recordFederationWave(taskId: string, tenantId: string, wave: FederationWave, status: "STARTED" | "COMPLETED" | "BLOCKED", envelopes: AgentEnvelope[]): Promise<void> {
  await appendExecutionEvidence(taskId, tenantId, {
    kind: status === "COMPLETED" ? "EXECUTION_FINISHED" : status === "BLOCKED" ? "TASK_FAILED" : "EXECUTION_STARTED",
    actor: "SYSTEM",
    summary: `Agent federation wave ${wave.wave} ${status.toLowerCase()}`,
    data: { wave: wave.wave, parallel: wave.parallel, agents: wave.assignments.map(item => item.agent), workItems: wave.assignments.map(item => item.workItemId), envelopes: envelopes.map(item => ({ workItemId: item.workItemId, agent: item.agent, status: item.status })) },
  });
}
