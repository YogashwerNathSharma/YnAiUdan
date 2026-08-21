import { generateStructuredCode } from "./code-generation-protocol.js";
import { generateWorkspaceChanges } from "./llm-coder.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace } from "./workspace-context.js";

export async function generateCoderWorkspaceChanges(provider: LlmProvider, input: { task: string; workspace: SharedWorkspace; model?: string }) {
  const generated = await generateStructuredCode(provider, { task: input.task, files: input.workspace.files, model: input.model });
  const changes = await generateWorkspaceChanges({ generate: async () => generated.patches }, { task: input.task, workspace: input.workspace });
  return { summary: generated.summary, plan: generated.plan, changes, model: generated.model };
}
