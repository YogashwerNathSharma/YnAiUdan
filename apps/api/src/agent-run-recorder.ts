import type { AgentOutcome } from "./multi-agent-orchestrator.js";
import type { AgentRunStore } from "./agent-run-state.js";

export class AgentRunRecorder {
  constructor(private readonly store: AgentRunStore) {}
  async started(runId: string, tenantId: string, agent: string): Promise<void> { await this.store.append(runId, tenantId, { at: new Date().toISOString(), type: `${agent}_STARTED`, agent, status: "RUNNING" }); }
  async completed(runId: string, tenantId: string, outcome: AgentOutcome): Promise<void> { await this.store.append(runId, tenantId, { at: new Date().toISOString(), type: `${outcome.agent}_COMPLETED`, agent: outcome.agent, status: outcome.status, summary: outcome.summary, data: outcome.data }); }
  async failed(runId: string, tenantId: string, error: unknown): Promise<void> { await this.store.append(runId, tenantId, { at: new Date().toISOString(), type: "RUN_ERROR", status: "FAILED", summary: error instanceof Error ? error.message : String(error) }); }
}
