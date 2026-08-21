import { generateStructuredCode } from "./code-generation-protocol.js";
import { generateWorkspaceChanges } from "./llm-coder.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace } from "./workspace-context.js";
import type { ContextChunkPackage } from "./context-engine-chunks.js";

export async function generateCoderWorkspaceChanges(provider: LlmProvider, input: { task: string; workspace: SharedWorkspace; model?: string; context?: ContextChunkPackage }) {
  const contextFiles = input.context?.files ?? input.workspace.files;
  const generated = await generateStructuredCode(provider, { task: input.task, files: contextFiles, model: input.model });
  const changes = await generateWorkspaceChanges({ generate: async () => generated.patches }, { task: input.task, workspace: input.workspace });
  return { summary: generated.summary, plan: generated.plan, changes, model: generated.model, context: input.context ? { selectedPaths: input.context.selectedPaths, chunks: input.context.chunks } : undefined };
}
