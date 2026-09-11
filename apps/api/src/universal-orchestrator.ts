import { db } from "./db.js";
import { runAgentBrain } from "./agent-brain.js";
import { taskQueue } from "./task-queue.js";
import { normalizeAutonomyMode, type AutonomyMode } from "./permissions.js";
import { buildUniversalPlan, type UniversalPlan } from "./universal-intelligence.js";
import { routeModel } from "./model-router.js";

export type UniversalOrchestrationInput = {
  userId: string;
  tenantId: string;
  role: string;
  goal: string;
  title?: string;
  projectId?: string;
  platform?: string;
  model?: string;
  autonomyMode?: string;
  approvalGranted?: boolean;
  maxSteps?: number;
  maxToolCalls?: number;
  maxRetries?: number;
  maxCycles?: number;
};

export type UniversalOrchestrationResult = {
  taskId: string;
  status: string;
  plan: UniversalPlan;
  brain?: unknown;
  approvalRequired: boolean;
  executionQueued: boolean;
};

function safeTitle(goal: string): string {
  return goal.trim().replace(/\s+/g, " ").slice(0, 120) || "Universal AI Task";
}

function canAutoExecute(mode: AutonomyMode, approvalGranted: boolean): boolean {
  if (!approvalGranted) return false;
  return mode === "AUTONOMOUS" || mode === "FULLY_CONTROLLED";
}

export async function orchestrateUniversalGoal(input: UniversalOrchestrationInput): Promise<UniversalOrchestrationResult> {
  const goal = input.goal.trim();
  if (!goal) throw new Error("Universal goal cannot be empty");
  if (input.projectId) {
    const project = await db.project.findFirst({ where: { id: input.projectId, tenantId: input.tenantId, members: { some: { userId: input.userId } } }, select: { id: true } });
    if (!project) throw new Error("Project not found");
  }

  const autonomyMode = normalizeAutonomyMode(input.autonomyMode ?? "ASK_BEFORE_TOOLS");
  const plan = buildUniversalPlan(goal, input.platform ?? "GENERAL");
  const model = input.model?.trim() || routeModel("reasoning");
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 50, 1), 1000);
  const maxToolCalls = Math.min(Math.max(input.maxToolCalls ?? 100, 1), 5000);
  const maxRetries = Math.min(Math.max(input.maxRetries ?? 3, 0), 20);
  const maxCycles = Math.min(Math.max(input.maxCycles ?? 20, 1), 100);

  const task = await db.task.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      projectId: input.projectId,
      title: input.title?.trim().slice(0, 200) || safeTitle(goal),
      goal,
      model,
      autonomyMode,
      status: "PLANNING",
      maxSteps,
      maxToolCalls,
      maxRetries,
      steps: { create: { sequence: 1, name: "PLAN", status: "RUNNING", input: { goal, universalPlan: plan } } },
    },
    select: { id: true },
  });

  const firstBrain = await runAgentBrain(task.id, {
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    maxCycles: maxCycles,
    replanOnFailure: true,
  });

  const approvalRequired = firstBrain && typeof firstBrain === "object" && (firstBrain as Record<string, unknown>).status === "WAITING_APPROVAL";
  if (!approvalRequired) {
    return { taskId: task.id, status: String((firstBrain as Record<string, unknown>)?.status ?? "PLANNING"), plan, brain: firstBrain, approvalRequired: false, executionQueued: false };
  }

  if (!canAutoExecute(autonomyMode, input.approvalGranted === true)) {
    return { taskId: task.id, status: "WAITING_APPROVAL", plan, brain: firstBrain, approvalRequired: true, executionQueued: false };
  }

  const pendingSteps = await db.taskStep.findMany({ where: { taskId: task.id, status: "PENDING" }, orderBy: { sequence: "asc" } });
  await Promise.all(pendingSteps.map(step => {
    const stepInput = (step.input ?? {}) as Record<string, unknown>;
    return db.taskStep.update({ where: { id: step.id }, data: { input: { ...stepInput, approvalGranted: true } } });
  }));
  await db.task.update({ where: { id: task.id }, data: { status: "RUNNING" } });
  await taskQueue.enqueue(task.id);

  return { taskId: task.id, status: "RUNNING", plan, brain: firstBrain, approvalRequired: false, executionQueued: true };
}
