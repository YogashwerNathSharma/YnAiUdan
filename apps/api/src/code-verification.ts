import { executeTool } from "./tool-executor.js";
import type { AutonomyMode } from "./permissions.js";

export type VerificationResult = {
  ok: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  command: string;
  error?: string;
};

const DEFAULT_COMMANDS = ["pnpm test", "pnpm typecheck", "pnpm build"];

export async function verifyCodeChange(params: {
  role: string;
  mode?: AutonomyMode;
  tenantId: string;
  userId: string;
  projectId?: string;
  commands?: string[];
}): Promise<VerificationResult[]> {
  const commands = (params.commands?.length ? params.commands : DEFAULT_COMMANDS).slice(0, 5);
  const results: VerificationResult[] = [];
  for (const command of commands) {
    const result = await executeTool({
      toolName: "terminal.execute",
      input: { command, mode: params.mode ?? "SAFE_AUTO" },
      role: params.role,
      mode: params.mode ?? "SAFE_AUTO",
      context: { tenantId: params.tenantId, userId: params.userId, projectId: params.projectId }
    });
    if (!result.ok) {
      results.push({ ok: false, command, error: result.error });
      break;
    }
    const output = result.output as { exitCode?: number; stdout?: string; stderr?: string };
    const ok = output.exitCode === 0;
    results.push({ ok, command, exitCode: output.exitCode, stdout: output.stdout, stderr: output.stderr });
    if (!ok) break;
  }
  return results;
}

export function verificationPassed(results: VerificationResult[]): boolean {
  return results.length > 0 && results.every(result => result.ok);
}
