import { taskQueue, type QueueJob } from "./task-queue.js";
import { executeNextTaskStep } from "./task-executor.js";
import { db } from "./db.js";
import { ENGINEERING_TASK_STEP } from "./engineering-task-queue.js";
import { executeEngineeringCommand, type EngineeringCommand } from "./engineering-orchestrator.js";
import type { GitHubClient } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";
import { AgentRunRecorder } from "./agent-run-recorder.js";
import type { AgentRunStore } from "./agent-run-state.js";

export type EngineeringWorkerDeps = { provider: LlmProvider; github: GitHubClient; store: AgentRunStore };

async function processEngineeringTask(task: { id: string; tenantId: string; userId: string; role: string; steps: Array<{ id: string; name: string | null; input: unknown }> }, deps: EngineeringWorkerDeps): Promise<void> {
  const step = task.steps.find(candidate => candidate.name === ENGINEERING_TASK_STEP);
  if (!step) throw new Error("Engineering task step not found");
  const command = step.input as EngineeringCommand;
  if (command.tenantId !== task.tenantId || command.userId !== task.userId) throw new Error("Engineering command identity mismatch");
  const recorder = new AgentRunRecorder(deps.store);
  await recorder.started(task.id, task.tenantId, "ENGINEERING");
  try {
    const result = await executeEngineeringCommand(command, { provider: deps.provider, github: deps.github });
    const success = result.engineering.status === "APPROVED" || result.engineering.status === "FIXED";
    await db.taskStep.update({ where: { id: step.id }, data: { status: success ? "COMPLETED" : result.engineering.status === "NEEDS_REVIEW" ? "PENDING" : "FAILED", output: { status: result.engineering.status, summary: result.engineering.summary, github: Boolean(result.github) }, error: success || result.engineering.status === "NEEDS_REVIEW" ? null : result.engineering.status, completedAt: success ? new Date() : undefined } });
    await recorder.completed(task.id, task.tenantId, { agent: "GITHUB", status: success ? "SUCCESS" : result.engineering.status, summary: result.engineering.summary, data: { github: Boolean(result.github) } });
    await db.task.update({ where: { id: task.id }, data: { status: success ? "COMPLETED" : result.engineering.status === "NEEDS_REVIEW" ? "PAUSED" : "FAILED" } });
  } catch (error) {
    await recorder.failed(task.id, task.tenantId, error);
    await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } });
    throw error;
  }
}

export async function processTaskQueueItem(item: QueueJob, engineeringDeps?: EngineeringWorkerDeps): Promise<void> {
  try {
    const task = await db.task.findUnique({ where: { id: item.taskId }, include: { user: { select: { role: true, tenantId: true } }, steps: { orderBy: { sequence: "asc" } } } });
    if (!task || task.status !== "RUNNING") { await taskQueue.complete?.(item.id); return; }
    if (task.user.tenantId !== task.tenantId) { await taskQueue.fail?.(item.id, "Task owner tenant mismatch"); return; }
    const engineeringStep = task.steps.find(step => step.name === ENGINEERING_TASK_STEP);
    if (engineeringStep) {
      if (!engineeringDeps) { await taskQueue.fail?.(item.id, "Engineering worker dependencies are not configured"); await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } }); return; }
      await processEngineeringTask({ id: task.id, tenantId: task.tenantId, userId: task.userId, role: task.user.role, steps: task.steps }, engineeringDeps);
      await taskQueue.complete?.(item.id);
      return;
    }
    const result = await executeNextTaskStep(task.id, task.userId, task.tenantId, task.user.role);
    if (result.status === "COMPLETED" || result.status === "PAUSED" || result.status === "WAITING_APPROVAL") { await taskQueue.complete?.(item.id); return; }
    if (result.status === "FAILED") { await taskQueue.fail?.(item.id, result.error ?? "Task step failed"); return; }
    await taskQueue.complete?.(item.id);
    await taskQueue.enqueue(task.id);
  } catch (error) {
    await taskQueue.fail?.(item.id, error instanceof Error ? error.message : "Task worker failed");
    throw error;
  }
}

export async function recoverStaleQueueJobs(maxAgeMs: number): Promise<number> {
  return taskQueue.recoverStale?.(maxAgeMs) ?? 0;
}
