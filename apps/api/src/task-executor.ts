import { db } from "./db.js";
import { executeTool } from "./tool-executor.js";
import { saveTaskMemory } from "./memory-service.js";

function compactMemoryValue(value: unknown): string { try { const text = typeof value === "string" ? value : JSON.stringify(value); return text.slice(0, 9000); } catch { return String(value).slice(0, 9000); } }
async function persistExecutionMemory(task: { id: string; tenantId: string; userId: string; projectId: string | null; title: string; goal: string }, input: { toolName: string; input?: unknown }, result: { ok: boolean; output?: unknown; error?: string; tool?: string }) { const toolName = result.tool ?? input.toolName; const status = result.ok ? "SUCCESS" : "FAILURE"; const value = result.ok ? `Task: ${task.title}\nGoal: ${task.goal}\nTool: ${toolName}\nInput: ${compactMemoryValue(input.input)}\nResult: ${compactMemoryValue(result.output)}` : `Task: ${task.title}\nGoal: ${task.goal}\nTool: ${toolName}\nInput: ${compactMemoryValue(input.input)}\nFailure: ${result.error ?? "Unknown tool failure"}`; await saveTaskMemory({ tenantId: task.tenantId, userId: task.userId, projectId: task.projectId ?? undefined, taskId: task.id, key: `tool:${toolName}:${status.toLowerCase()}`, value, importance: result.ok ? 0.75 : 0.85 }); }

export async function executeNextTaskStep(taskId: string, userId: string, tenantId: string, role: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  if (task.status !== "RUNNING") throw new Error(`Task is not executable in ${task.status} state`);
  const completed = task.steps.filter(step => step.status === "COMPLETED").length;
  if (task.maxSteps !== null && completed >= task.maxSteps) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); return { status: "PAUSED", reason: "MAX_STEPS_REACHED" }; }
  const completedToolCalls = task.steps.filter(step => step.name === "TOOL" && step.status === "COMPLETED").length;
  if (task.maxToolCalls !== null && completedToolCalls >= task.maxToolCalls) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); return { status: "PAUSED", reason: "MAX_TOOL_CALLS_REACHED" }; }

  // Atomically claim one pending step. This prevents two workers from executing the same tool concurrently.
  const pending = task.steps.find(candidate => candidate.status === "PENDING");
  if (!pending) { await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED" } }); return { status: "COMPLETED" }; }
  const claimed = await db.taskStep.updateMany({ where: { id: pending.id, taskId: task.id, status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date() } });
  if (claimed.count !== 1) return { status: "RUNNING", reason: "STEP_ALREADY_CLAIMED", stepId: pending.id };
  const step = pending;
  if (step.name !== "TOOL") { await db.taskStep.update({ where: { id: step.id }, data: { status: "COMPLETED", completedAt: new Date(), output: { acknowledged: true } } }); return { status: "COMPLETED", stepId: step.id, next: true }; }
  const input = (step.input ?? {}) as { toolName?: string; input?: unknown; approvalGranted?: boolean };
  if (!input.toolName) { await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: "Tool step is missing toolName", completedAt: new Date() } }); return { status: "FAILED", stepId: step.id, error: "Tool step is missing toolName" }; }
  const result = await executeTool({ toolName: input.toolName, input: input.input, tenantId: task.tenantId, role, mode: task.autonomyMode, approvalGranted: input.approvalGranted === true });
  if (result.ok) { await db.taskStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: result.output as object, completedAt: new Date() } }); await persistExecutionMemory(task, input as { toolName: string; input?: unknown }, result); return { status: "COMPLETED", stepId: step.id, tool: result.tool, output: result.output }; }
  if (result.requiresApproval) { await db.taskStep.update({ where: { id: step.id }, data: { status: "PENDING", startedAt: null } }); await db.task.update({ where: { id: task.id }, data: { status: "WAITING_APPROVAL" } }); return { status: "WAITING_APPROVAL", stepId: step.id, tool: result.tool, error: result.error }; }
  await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: result.error, completedAt: new Date() } }); await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } }); await persistExecutionMemory(task, input as { toolName: string; input?: unknown }, result); return { status: "FAILED", stepId: step.id, tool: result.tool, error: result.error };
}
