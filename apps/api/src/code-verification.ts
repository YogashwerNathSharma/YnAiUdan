import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VerificationResult = { command: string; ok: boolean; output?: string; error?: string };

export async function verifyCodeChange(input: { role: string; mode?: "FAST" | "STANDARD" | "STRICT"; tenantId: string; userId: string; projectId?: string; commands?: string[] }): Promise<VerificationResult[]> {
  const commands = input.commands ?? [];
  if (!commands.length) return [{ command: "verification", ok: true, output: "No verification commands configured." }];
  const results: VerificationResult[] = [];
  for (const command of commands) {
    try {
      const [program, ...args] = command.trim().split(/\s+/);
      if (!program) continue;
      const result = await execFileAsync(program, args, { timeout: input.mode === "STRICT" ? 120000 : 60000, maxBuffer: 1024 * 1024 });
      results.push({ command, ok: true, output: `${result.stdout}${result.stderr}`.trim() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ command, ok: false, error: message });
    }
  }
  return results;
}

export function verificationPassed(results: VerificationResult[]): boolean {
  return results.length > 0 && results.every(result => result.ok);
}
