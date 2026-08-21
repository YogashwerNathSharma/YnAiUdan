import { db } from "./db.js";
import type { AgentRun, AgentRunEvent, AgentRunStatus, AgentRunStore } from "./agent-run-state.js";

export class PrismaAgentRunStore implements AgentRunStore {
  async create(run: AgentRun): Promise<void> {
    await db.task.create({ data: { id: run.id, tenantId: run.tenantId, userId: run.userId, title: "AI Engineering Run", goal: run.task, status: "RUNNING" } });
    for (const event of run.events) await db.taskStep.create({ data: { taskId: run.id, sequence: 0, name: event.type, type: "RESULT", status: event.status === "FAILED" ? "FAILED" : "COMPLETED", output: event.data ?? { summary: event.summary }, startedAt: new Date(event.at), completedAt: new Date(event.at) } });
  }

  async get(id: string, tenantId: string): Promise<AgentRun | null> {
    const task = await db.task.findFirst({ where: { id, tenantId }, include: { steps: { orderBy: { createdAt: "asc" } } } });
    if (!task) return null;
    return { id: task.id, tenantId: task.tenantId, userId: task.userId, task: task.goal, status: this.mapStatus(task.status), startedAt: (task.startedAt ?? task.createdAt).toISOString(), updatedAt: task.updatedAt.toISOString(), events: task.steps.map(step => ({ at: (step.startedAt ?? task.createdAt).toISOString(), type: step.name ?? "TASK_STEP", status: step.status, summary: typeof step.output === "object" && step.output && "summary" in step.output ? String((step.output as { summary?: unknown }).summary) : undefined, data: step.output })) } };
  }

  async append(id: string, tenantId: string, event: AgentRunEvent): Promise<AgentRun> {
    const task = await db.task.findFirst({ where: { id, tenantId } });
    if (!task) throw new Error("Agent run not found");
    const count = await db.taskStep.count({ where: { taskId: id } });
    await db.taskStep.create({ data: { taskId: id, sequence: count, name: event.type, type: "RESULT", status: event.status === "FAILED" ? "FAILED" : "COMPLETED", output: event.data ?? { summary: event.summary }, startedAt: new Date(event.at), completedAt: new Date(event.at) } });
    return (await this.get(id, tenantId))!;
  }

  async updateStatus(id: string, tenantId: string, status: AgentRunStatus): Promise<AgentRun> {
    const mapped = status === "SUCCESS" ? "COMPLETED" : status === "CANCELLED" ? "CANCELLED" : status === "RUNNING" ? "RUNNING" : "FAILED";
    await db.task.updateMany({ where: { id, tenantId }, data: { status: mapped, startedAt: mapped === "RUNNING" ? new Date() : undefined } });
    const run = await this.get(id, tenantId);
    if (!run) throw new Error("Agent run not found");
    return run;
  }

  private mapStatus(status: string): AgentRunStatus {
    if (status === "COMPLETED") return "SUCCESS";
    if (status === "CANCELLED") return "CANCELLED";
    if (status === "RUNNING" || status === "PLANNING" || status === "WAITING_APPROVAL" || status === "QUEUED") return "RUNNING";
    return status === "FAILED" ? "FAILED" : "NEEDS_REVIEW";
  }
}
