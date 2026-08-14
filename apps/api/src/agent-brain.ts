import { db } from "./db.js";
import { executeNextTaskStep } from "./task-executor.js";
import { planToolSteps } from "./tool-planner.js";

export type BrainRunOptions = { userId: string; tenantId: string; role: string; maxCycles?: number; replanOnFailure?: boolean };

export async function runAgentBrain(taskId: string, options: BrainRunOptions) {
  const maxCycles = Math.min(100, Math.max(1, options.maxCycles ?? 20));
  const events: Array<Record<string, unknown>> = [];
  let replanned = false;

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const task = await db.task.findFirst({ where: { id: taskId, userId: options.userId, tenantId: options.tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    if (!task) throw new Error("Task not found");

    if (task.status === "PLANNING") {
      const steps = await planToolSteps(task.goal, task.model ?? "mock:default");
      if (steps.length > (task.maxSteps ?? 50)) throw new Error("Generated plan exceeds task step limit");
      await db.taskStep.deleteMany({ where: { taskId: task.id } });
      await db.taskStep.createMany({ data: steps.map((step, index) => ({ taskId: task.id, sequence: index + 1, name: "TOOL", status: "PENDING" as const, input: { toolName: step.tool, input: step.input, reason: step.reason } })) });
      await db.task.update({ where: { id: task.id }, data: { status: "RUNNING" } });
      events.push({ cycle, phase: "PLAN", steps: steps.length });
      continue;
    }

    if (task.status === "WAITING_APPROVAL" || task.status === "PAUSED" || task.status === "COMPLETED" || task.status === "CANCELLED") return { status: task.status, cycles: cycle - 1, events };
    if (task.status !== "RUNNING") return { status: task.status, cycles: cycle - 1, events };

    const result = await executeNextTaskStep(task.id, options.userId, options.tenantId, options.role);
    events.push({ cycle, phase: "EXECUTE", result });
    if (result.status === "COMPLETED" || result.status === "WAITING_APPROVAL" || result.status === "PAUSED") return { status: result.status, cycles: cycle, events };
    if (result.status === "FAILED") {
      if (!options.replanOnFailure || replanned) return { status: "FAILED", cycles: cycle, events, replanned };
      replanned = true;
      await db.task.update({ where: { id: task.id }, data: { status: "PLANNING" } });
      events.push({ cycle, phase: "REPLAN", reason: result.error ?? "step failed" });
    }
  }

  return { status: "PAUSED", reason: "BRAIN_CYCLE_LIMIT", cycles: maxCycles, events };
}
