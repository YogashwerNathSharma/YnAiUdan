import { generateCoderWorkspaceChanges } from "./orchestrated-coder-adapter.js";
import { reviewVerifyRepairWorkspace, type ReviewVerifyRepairResult } from "./review-verify-repair-loop.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace, WorkspaceChange } from "./workspace-context.js";

export type EngineeringPipelineResult = ReviewVerifyRepairResult & { summary: string; plan: string[] };

export async function runEngineeringPipeline(params: {
  provider: LlmProvider;
  workspace: SharedWorkspace;
  task: string;
  role: string;
  userId: string;
  projectId?: string;
  model?: string;
  commands?: string[];
  maxAttempts?: number;
  repair?: (context: { task: string; workspace: SharedWorkspace; attempt: number; review: ReviewVerifyRepairResult["review"]; verification: ReviewVerifyRepairResult["verification"] }) => Promise<WorkspaceChange[] | null>;
}): Promise<EngineeringPipelineResult> {
  const generated = await generateCoderWorkspaceChanges(params.provider, { task: params.task, workspace: params.workspace, model: params.model });
  const seededWorkspace = {
    ...params.workspace,
    files: params.workspace.files,
    changes: params.workspace.changes
  };
  const result = await reviewVerifyRepairWorkspace({
    workspace: seededWorkspace,
    role: params.role,
    userId: params.userId,
    projectId: params.projectId,
    commands: params.commands,
    maxAttempts: params.maxAttempts,
    repair: async (diagnosis, review, verification, attempt) => {
      if (!params.repair) return null;
      return params.repair({ task: `${params.task}\nDebugger diagnosis: ${diagnosis.summary}`, workspace: seededWorkspace, attempt, review, verification });
    }
  });
  return { ...result, summary: generated.summary, plan: generated.plan };
}
