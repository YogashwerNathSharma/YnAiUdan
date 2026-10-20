import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeSandboxed } from "./sandbox-runtime.js";
import { validateSandboxCommand } from "./sandbox-policy.js";

export type VerificationResult = { command: string; ok: boolean; output?: string; error?: string };

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const char of command.trim()) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { parts.push(current); current = ""; }
      continue;
    }
    current += char;
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("Unterminated quote in verification command");
  if (current) parts.push(current);
  return parts;
}

function safeWorkspacePath(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) {
    throw new Error("Unsafe verification workspace path: " + relative);
  }
  const destination = path.resolve(root, relative);
  if (destination !== root && !destination.startsWith(root + path.sep)) {
    throw new Error("Verification path escapes workspace: " + relative);
  }
  return destination;
}

export async function verifyCodeChange(input: {
  role: string;
  mode?: "FAST" | "STANDARD" | "STRICT";
  tenantId: string;
  userId: string;
  projectId?: string;
  commands?: string[];
  files?: Array<{ path: string; content: string }>;
}): Promise<VerificationResult[]> {
  const commands = input.commands ?? [];
  if (!commands.length) return [{ command: "verification", ok: true, output: "No verification commands configured." }];

  const root = await mkdtemp(path.join(os.tmpdir(), "ynaiudan-verify-"));
  try {
    for (const file of input.files ?? []) {
      const destination = safeWorkspacePath(root, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
    }

    const results: VerificationResult[] = [];
    for (const command of commands) {
      try {
        validateSandboxCommand(command);
        const parts = splitCommand(command);
        const executable = parts[0];
        if (!executable) throw new Error("Verification command is empty");
        const result = await executeSandboxed({
          executable,
          args: parts.slice(1),
          tenantId: input.tenantId,
          cwd: root,
          timeoutMs: input.mode === "STRICT" ? 120_000 : 60_000,
        });
        const output = (result.stdout + result.stderr).trim();
        const ok = result.exitCode === 0 && !result.timedOut;
        results.push({
          command,
          ok,
          output,
          error: ok ? undefined : result.timedOut ? "Verification command timed out" : "Verification command exited with code " + result.exitCode,
        });
      } catch (error) {
        results.push({ command, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function verificationPassed(results: VerificationResult[]): boolean {
  return results.length > 0 && results.every(result => result.ok);
}
