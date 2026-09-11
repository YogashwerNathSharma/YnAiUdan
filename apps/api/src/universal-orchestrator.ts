import { db } from "./db.js";
import { runAgentBrain } from "./agent-brain.js";
import { taskQueue } from "./task-queue.js";
import { normalizeAutonomyMode, type AutonomyMode } from "./permissions.js";
import { buildUniversalPlan, type UniversalPlan } from "./universal-intelligence.js";
import { routeModel } from "./model-router.js";
import { appendExecutionEvidence, createExecutionLedger } from "./universal-execution-ledger.js";

export type UniversalOrchestrationInput = { userId: string; tenantId: string; role: string; goal: string; title?: string; projectId?: string; platform?: string; model?: string; autonomyMode?: string; approvalGranted?: boolean; maxSteps?: number; maxToolCalls?: number; maxRetries?: number; maxCycles?: number };
export type UniversalOrchestrationResult = { taskId: string; status: string; plan: UniversalPlan; brain?: unknown; approvalRequired: boolean; executionQueued: boolean };
function safeTitle(goal: string): string { return goal.trim().replace(/\s+/g, " ").slice(0, 120) || "Universal AI Task"; }
function canAutoExecute(mode: AutonomyMode, approvalGranted: boolean): boolean { return approvalGranted && (mode === "AUTONOMOUS" || mode === "FULLY_CONTROLLED"); }

export async function orchestrateUniversalGoal(input: UniversalOrchestrationInput): Promise<UniversalOrchestrationResult> {
  const goal = input.goal.trim(); if (!goal) throw new Error("Universal goal cannot be empty");
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

  const task = await db.task.create({ data: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, title: input.title?.trim().slice(0, 200) || safeTitle(goal), goal, model, autonomyMode, status: "PLANNING", maxSteps, maxToolCalls, maxRetries, steps: { create: { sequence: 1, name: "PLAN", status: "RUNNING", input: { goal, universalPlan: plan } } } }, select: { id: true } });
  await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "GOAL_ACCEPTED", actor: "USER", summary: "Universal goal accepted", data: { platform: input.platform ?? "GENERAL", model, autonomyMode } });
  await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "PLAN_CREATED", actor: "SYSTEM", summary: "Dependency-aware universal execution plan created", data: { workItems: plan.workItems, executionWaves: plan.executionWaves } });
  for (const item of plan.workItems) await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "AGENT_ASSIGNED", actor: "SYSTEM", summary: `${item.agent} assigned to ${item.workItemId}`, data: { risk: item.risk, dependsOn: item.dependsOn ?? [], parallelGroup: item.parallelGroup } });

  const firstBrain = await runAgentBrain(task.id, { userId: input.userId, tenantId: input.tenantId, role: input.role, maxCycles, replanOnFailure: true });
  const brainStatus = firstBrain && typeof firstBrain === "object" ? String((firstBrain as Record<string, unknown>).status ?? "PLANNING") : "PLANNING";
  const approvalRequired = brainStatus === "WAITING_APPROVAL";
  if (approvalRequired) await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "APPROVAL_REQUIRED", actor: "SYSTEM", summary: "Execution requires approval", data: { autonomyMode } });
  if (!approvalRequired) return { taskId: task.id, status: brainStatus, plan, brain: firstBrain, approvalRequired: false, executionQueued: false };
  if (!canAutoExecute(autonomyMode, input.approvalGranted === true)) return { taskId: task.id, status: "WAITING_APPROVAL", plan, brain: firstBrain, approvalRequired: true, executionQueued: false };

  const pendingSteps = await db.taskStep.findMany({ where: { taskId: task.id, status: "PENDING" }, orderBy: { sequence: "asc" } });
  await Promise.all(pendingSteps.map(step => { const stepInput = (step.input ?? {}) as Record<string, unknown>; return db.taskStep.update({ where: { id: step.id }, data: { input: { ...stepInput, approvalGranted: true } } }); }));
  await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "APPROVAL_GRANTED", actor: "USER", summary: "Execution approval granted", data: { approvedSteps: pendingSteps.length } });
  await db.task.update({ where: { id: task.id }, data: { status: "RUNNING" } });
  await appendExecutionEvidence({ taskId: task.id, tenantId: input.tenantId, kind: "EXECUTION_STARTED", actor: "SYSTEM", summary: "Universal task queued for execution", data: { queue: "taskQueue", steps: pendingSteps.length } });
  await taskQueue.enqueue(task.id);
  return { taskId: task.id, status: "RUNNING", plan, brain: firstBrain, approvalRequired: false, executionQueued: true };
}
