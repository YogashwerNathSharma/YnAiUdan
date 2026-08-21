export type AgentRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "NEEDS_REVIEW" | "CANCELLED";
export type AgentRunEvent = { at: string; type: string; agent?: string; status?: string; summary?: string; data?: unknown };
export type AgentRun = { id: string; tenantId: string; userId: string; task: string; status: AgentRunStatus; startedAt: string; updatedAt: string; events: AgentRunEvent[] };

export interface AgentRunStore { create(run: AgentRun): Promise<void>; get(id: string, tenantId: string): Promise<AgentRun | null>; append(id: string, tenantId: string, event: AgentRunEvent): Promise<AgentRun>; updateStatus(id: string, tenantId: string, status: AgentRunStatus): Promise<AgentRun>; }

export class InMemoryAgentRunStore implements AgentRunStore {
  private readonly runs = new Map<string, AgentRun>();
  async create(run: AgentRun): Promise<void> { this.runs.set(run.id, structuredClone(run)); }
  async get(id: string, tenantId: string): Promise<AgentRun | null> { const run = this.runs.get(id); return run?.tenantId === tenantId ? structuredClone(run) : null; }
  async append(id: string, tenantId: string, event: AgentRunEvent): Promise<AgentRun> { const run = this.runs.get(id); if (!run || run.tenantId !== tenantId) throw new Error("Agent run not found"); run.events.push(event); run.updatedAt = new Date().toISOString(); return structuredClone(run); }
  async updateStatus(id: string, tenantId: string, status: AgentRunStatus): Promise<AgentRun> { const run = this.runs.get(id); if (!run || run.tenantId !== tenantId) throw new Error("Agent run not found"); run.status = status; run.updatedAt = new Date().toISOString(); return structuredClone(run); }
}

export function createAgentRun(input: { id: string; tenantId: string; userId: string; task: string }): AgentRun { const now = new Date().toISOString(); return { id: input.id, tenantId: input.tenantId, userId: input.userId, task: input.task, status: "RUNNING", startedAt: now, updatedAt: now, events: [{ at: now, type: "RUN_STARTED", status: "RUNNING" }] }; }
