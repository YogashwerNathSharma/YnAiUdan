import { db } from "./db.js";
import { toolRegistry } from "./tools.js";

export async function executeNextTaskStep(taskId: string, userId: string, tenantId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  if (!["RUNNING"].includes(task.status)) throw new Error(`Task is not executable in ${task.status} state`);
  const completed = task.steps.filter(step => step.status === "COMPLETED").length;
  if (task.maxSteps !== null && completed >= task.maxSteps) return { status: "PAUSED", reason: "MAX_STEPS_REACHED" };
  const step = task.steps.find(candidate => candidate.status === "PENDING");
  if (!step) {
    await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED" } });
    return { status: "COMPLETED" };
  }
  if (step.name !== "TOOL") return { status: "WAITING_APPROVAL", stepId: step.id, reason: "NON_TOOL_STEP_REQUIRES_EXECUTION_POLICY" };
  const input = (step.input ?? {}) as { toolName?: string; input?: unknown };
  if (!input.toolName) throw new Error("Tool step is missing toolName");
  const tool = toolRegistry.get(input.toolName);
  if (!tool) throw new Error(`Unknown tool: ${input.toolName}`);
  await db.taskStep.update({ where: { id: step.id }, data: { status: "RUNNING", startedAt: new Date() } });
  try {
    const output = await Promise.race([tool.execute(input.input), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Tool timeout")), tool.timeoutMs))]);
    await db.taskStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: output as object, completedAt: new Date() } });
    return { status: "COMPLETED", stepId: step.id, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } });
    return { status: "FAILED", stepId: step.id, error: message };
  }
}
