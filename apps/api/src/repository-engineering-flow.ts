import { buildContextPackage } from "./context-engine.js";
import { addRelevantChunks } from "./context-engine-chunks.js";
import { generateCoderWorkspaceChanges } from "./orchestrated-coder-adapter.js";
import { reviewVerifyRepairWorkspace, type ReviewVerifyRepairResult } from "./review-verify-repair-loop.js";
import { applyWorkspaceChanges, type SharedWorkspace, type WorkspaceChange } from "./workspace-context.js";
import type { RepositoryTreeClient } from "./github-tree-index.js";
import type { GitHubRepository } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";

export async function runRepositoryEngineeringFlow(params: {
  client: RepositoryTreeClient;
  repository: GitHubRepository;
  ref: string;
  task: string;
  tenantId: string;
  userId: string;
  role: string;
  projectId?: string;
  model?: string;
  maxFiles?: number;
  maxChunks?: number;
  commands?: string[];
  maxAttempts?: number;
  llm: LlmProvider;
  repair?: (input: { task: string; workspace: SharedWorkspace; attempt: number; review: ReviewVerifyRepairResult["review"]; verification: ReviewVerifyRepairResult["verification"] }) => Promise<WorkspaceChange[] | null>;
}) {
  const context = addRelevantChunks(await buildContextPackage({ client: params.client, repository: params.repository, ref: params.ref, task: params.task, tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, maxFiles: params.maxFiles }), params.task, params.maxChunks ?? 20);
  const workspace: SharedWorkspace = { tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, baseRef: params.ref, files: context.files, changes: [] };
  const generated = await generateCoderWorkspaceChanges(params.llm, { task: params.task, workspace, model: params.model, context });
  const seededWorkspace = applyWorkspaceChanges(workspace, generated.changes);
  const result = await reviewVerifyRepairWorkspace({ workspace: seededWorkspace, role: params.role, userId: params.userId, projectId: params.projectId, commands: params.commands, maxAttempts: params.maxAttempts, repair: async (diagnosis, review, verification, attempt) => params.repair ? params.repair({ task: `${params.task}\nDebugger diagnosis: ${diagnosis.summary}`, workspace: seededWorkspace, attempt, review, verification }) : null });
  return { context, generated, result };
}
