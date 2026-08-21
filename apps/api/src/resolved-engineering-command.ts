import { resolveWorkspace, type WorkspaceReference, type WorkspaceFileLoader } from "./workspace-resolver.js";
import { executeEngineeringCommand, type EngineeringCommand } from "./engineering-orchestrator.js";
import type { GitHubClient } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace } from "./workspace-context.js";

export type ResolvedEngineeringInput = Omit<EngineeringCommand, "workspace"> & { workspaceReference: WorkspaceReference; files: string[] };

export async function executeResolvedEngineeringCommand(input: ResolvedEngineeringInput, deps: { provider: LlmProvider; github: GitHubClient; loader?: WorkspaceFileLoader }) {
  if (input.workspaceReference.tenantId !== input.tenantId) throw new Error("Tenant mismatch between command and workspace reference");
  if (input.workspaceReference.userId !== input.userId) throw new Error("User mismatch between command and workspace reference");
  const loader = deps.loader ?? { getFile: (repository: typeof input.workspaceReference.repository, path: string, ref: string) => deps.github.getFile(repository, path, ref) };
  const workspace: SharedWorkspace = await resolveWorkspace(input.workspaceReference, input.files, loader);
  return executeEngineeringCommand({ ...input, workspace }, { provider: deps.provider, github: deps.github });
}
