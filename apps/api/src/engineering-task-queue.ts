import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { taskQueue } from "./task-queue.js";
import type { EngineeringCommand } from "./engineering-orchestrator.js";

const ENGINEERING_STEP = "ENGINEERING_RUN";

export async function enqueueEngineeringCommand(input: EngineeringCommand): Promise<{ taskId: string; queueJobId: string }> {
  if (input.workspace.tenantId !== input.tenantId) throw new Error("Tenant mismatch between command and workspace");
  if (input.workspace.userId !== input.userId) throw new Error("User mismatch between command and workspace");
  const taskId = randomUUID();
  await db.task.create({
    data: {
      id: taskId,
      tenantId: input.tenantId,
      userId: input.userId,
      projectId: input.workspace.projectId ?? null,
      title: input.title,
      goal: input.task,
      model: input.model ?? "provider:default",
      status: "RUNNING",
      autonomyMode: "ASK_BEFORE_TOOLS",
      maxSteps: input.maxAttempts ?? 3,
      steps: {
        create: {
          sequence: 0,
          name: ENGINEERING_STEP,
          type: "PLAN",
          status: "PENDING",
          input: input as unknown as object
        }
      }
    }
  });
  const job = await taskQueue.enqueue(taskId);
  return { taskId, queueJobId: job.id };
}

export const ENGINEERING_TASK_STEP = ENGINEERING_STEP;
