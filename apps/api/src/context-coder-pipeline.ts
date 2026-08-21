import { addRelevantChunks, type ContextChunkPackage } from "./context-engine-chunks.js";
import { buildContextPackage } from "./context-engine.js";
import { generateCoderWorkspaceChanges } from "./orchestrated-coder-adapter.js";
import type { RepositoryTreeClient } from "./github-tree-index.js";
import type { GitHubRepository } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";

export async function buildCoderInputFromRepository(params: {
  client: RepositoryTreeClient;
  repository: GitHubRepository;
  ref: string;
  task: string;
  tenantId: string;
  userId: string;
  projectId?: string;
  maxFiles?: number;
  maxChunks?: number;
  provider?: Parameters<typeof generateCoderWorkspaceChanges>[0];
  semanticProvider?: Parameters<typeof buildContextPackage>[0]["semanticProvider"];
}): Promise<ContextChunkPackage> {
  const context = await buildContextPackage({ ...params, semanticProvider: params.semanticProvider });
  return addRelevantChunks(context, params.task, params.maxChunks ?? 20);
}

export async function generateCoderFromRepositoryContext(params: Parameters<typeof buildCoderInputFromRepository>[0] & { llm: LlmProvider; model?: string }) {
  const context = await buildCoderInputFromRepository(params);
  const generated = await generateCoderWorkspaceChanges(params.llm, { task: params.task, workspace: { tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, baseRef: params.ref, files: context.files, changes: [] }, model: params.model, context });
  return { context, generated };
}
