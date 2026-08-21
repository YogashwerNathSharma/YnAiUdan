import { createAgentRun, type AgentRunStore } from "./agent-run-state.js";
import { AgentRunRecorder } from "./agent-run-recorder.js";
import { executeEngineeringCommand, type EngineeringCommand } from "./engineering-orchestrator.js";
import type { GitHubClient } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";

export async function executeRecordedEngineeringCommand(input: EngineeringCommand, deps: { provider: LlmProvider; github: GitHubClient; store: AgentRunStore; runId: string }) {
  const run = createAgentRun({ id: deps.runId, tenantId: input.tenantId, userId: input.userId, task: input.task });
  await deps.store.create(run);
  const recorder = new AgentRunRecorder(deps.store);
  await recorder.started(deps.runId, input.tenantId, "ENGINEERING");
  try {
    const result = await executeEngineeringCommand(input, { provider: deps.provider, github: deps.github });
    await recorder.completed(deps.runId, input.tenantId, { agent: "GITHUB", status: result.engineering.status === "APPROVED" || result.engineering.status === "FIXED" ? "SUCCESS" : result.engineering.status, summary: result.engineering.summary, data: { github: Boolean(result.github) } });
    await deps.store.updateStatus(deps.runId, input.tenantId, result.engineering.status === "APPROVED" || result.engineering.status === "FIXED" ? "SUCCESS" : result.engineering.status);
    return { runId: deps.runId, result };
  } catch (error) {
    await recorder.failed(deps.runId, input.tenantId, error);
    await deps.store.updateStatus(deps.runId, input.tenantId, "FAILED");
    throw error;
  }
}
