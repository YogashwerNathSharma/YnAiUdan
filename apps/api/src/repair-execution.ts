import { z } from "zod";
import { db } from "./db.js";
import { githubRegistry } from "./github-agent.js";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";
import { buildCiRepairPlan } from "./ci-repair-planner.js";

const inputSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), base: z.string().min(1).max(200), branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes: z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100), approved: z.boolean().default(false), push: z.boolean().default(false) });

export type RepairExecutionInput = z.infer<typeof inputSchema>;

export function validateRepairExecution(input: RepairExecutionInput) {
  validateBranchName(input.branch);
  if (input.base === input.branch) throw new Error("Repair branch must differ from base branch");
  const action = input.push ? "PUSH" : "COMMIT";
  return { action, needsApproval: requiresApproval(action, input.branch), approved: input.approved };
}

export async function executeApprovedRepair(input: RepairExecutionInput) {
  const policy = validateRepairExecution(input);
  if (policy.needsApproval && !policy.approved) return { status: "WAITING_APPROVAL" as const, action: policy.action, files: input.changes.map(change => change.path) };
  const client = githubRegistry.getClient();
  const repo = { owner: input.owner, name: input.name, defaultBranch: input.base };
  const result = input.push
    ? await client.push(repo, input.branch, input.message, input.changes)
    : await client.commitChanges(repo, input.branch, input.message, input.changes);
  return { status: "COMPLETED" as const, result };
}

export function repairAttemptAllowed(attempts: number, maxAttempts = 3): boolean { return attempts < Math.min(3, Math.max(1, maxAttempts)); }

export async function recordRepairAttempt(taskId: string, tenantId: string, success: boolean, category: string, details: unknown) {
  const task = await db.task.findFirst({ where: { id: taskId, tenantId }, select: { id: true } });
  if (!task) throw new Error("Task not found");
  await db.taskStep.create({ data: { taskId, sequence: Date.now(), name: "CI_REPAIR", status: success ? "COMPLETED" : "FAILED", input: { category }, output: details as object, completedAt: new Date() } });
}

export function createRepairPlan(input: { jobs: Parameters<typeof buildCiRepairPlan>[0]["jobs"]; log?: string }) { return buildCiRepairPlan(input); }
