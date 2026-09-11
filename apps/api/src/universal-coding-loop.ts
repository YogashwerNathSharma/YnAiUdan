import { routeModel, routeProvider } from "./model-router.js";
import { executeTool, type ToolExecutionResult } from "./tool-executor.js";
import { verifyExecution, type VerificationReport } from "./verification-engine.js";

export type CodingLoopInput = {
  goal: string;
  tenantId: string;
  role: string;
  mode?: string;
  language?: string;
  workspaceContext?: string;
  maxAttempts?: number;
};

export type CodingLoopAttempt = {
  attempt: number;
  generated: string;
  execution?: ToolExecutionResult;
  verification?: VerificationReport;
  repaired: boolean;
};

export type CodingLoopResult = {
  success: boolean;
  attempts: CodingLoopAttempt[];
  summary: string;
  evidence: string[];
};

const MAX_ATTEMPTS = 3;
const MAX_MODEL_OUTPUT = 20_000;

function extractCommand(text: string): string | undefined {
  const match = text.match(/(?:^|\n)\s*COMMAND:\s*(.+)\s*$/im);
  return match?.[1]?.trim();
}

function extractFiles(text: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const pattern = /FILE:\s*([^\n]+)\n```[^\n]*\n([\s\S]*?)\n```/g;
  for (const match of text.matchAll(pattern)) {
    const path = match[1]?.trim();
    const content = match[2] ?? "";
    if (path) files.push({ path, content });
  }
  return files;
}

async function askModel(input: CodingLoopInput, diagnostic?: string): Promise<string> {
  const model = routeModel("coding");
  const provider = routeProvider(model);
  const prompt = [
    `Goal: ${input.goal}`,
    `Target language: ${input.language ?? "infer"}`,
    "Produce a minimal, testable implementation.",
    "Return files as FILE: relative/path followed by a fenced code block.",
    "Return a safe workspace-relative validation command as COMMAND:.",
    diagnostic ? `Previous execution diagnostic:\n${diagnostic}\nRepair the implementation rather than merely explaining the error.` : "",
    input.workspaceContext ? `Workspace context:\n${input.workspaceContext}` : "",
  ].filter(Boolean).join("\n\n");
  const response = await provider.chat({
    model,
    maxTokens: MAX_MODEL_OUTPUT,
    messages: [
      { role: "system", content: "You are YnAiUdan's universal coding planner. Prefer small deterministic changes, never use destructive commands, never access secrets, and never rely on network access." },
      { role: "user", content: prompt },
    ],
  });
  return response.content;
}

async function writeFiles(input: CodingLoopInput, generated: string): Promise<string[]> {
  const files = extractFiles(generated);
  const evidence: string[] = [];
  for (const file of files) {
    const result = await executeTool({
      toolName: "workspace.write",
      input: { path: file.path, content: file.content, mode: input.mode ?? "ASK_BEFORE_TOOLS" },
      tenantId: input.tenantId,
      role: input.role,
      mode: input.mode ?? "ASK_BEFORE_TOOLS",
      approvalGranted: true,
    });
    if (!result.ok) throw new Error(`workspace.write failed for ${file.path}: ${result.error}`);
    evidence.push(`wrote:${file.path}`);
  }
  return evidence;
}

export async function runUniversalCodingLoop(input: CodingLoopInput): Promise<CodingLoopResult> {
  const attempts: CodingLoopAttempt[] = [];
  const evidence: string[] = [];
  const maxAttempts = Math.min(Math.max(input.maxAttempts ?? MAX_ATTEMPTS, 1), MAX_ATTEMPTS);
  let diagnostic = "";
  let previousFingerprint = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await askModel(input, diagnostic);
    const attemptRecord: CodingLoopAttempt = { attempt, generated, repaired: attempt > 1 };
    try {
      evidence.push(...await writeFiles(input, generated));
      const command = extractCommand(generated);
      if (!command) throw new Error("Model did not provide a validation command");
      const execution = await executeTool({
        toolName: "terminal.execute",
        input: { command, timeoutMs: 120_000 },
        tenantId: input.tenantId,
        role: input.role,
        mode: input.mode ?? "ASK_BEFORE_TOOLS",
        approvalGranted: true,
      });
      attemptRecord.execution = execution;
      if (!execution.ok) {
        diagnostic = execution.error;
      } else {
        const output = execution.output as { exitCode?: number; stdout?: string; stderr?: string };
        const verification = verifyExecution({ exitCode: output.exitCode ?? 1, stdout: output.stdout, stderr: output.stderr });
        attemptRecord.verification = verification;
        evidence.push(`verification:${verification.score}%`);
        if (verification.verified) {
          return { success: true, attempts, summary: `Verified after ${attempt} attempt(s).`, evidence };
        }
        diagnostic = verification.summary;
      }
    } catch (error) {
      diagnostic = error instanceof Error ? error.message : "Coding loop failed";
    }
    const fingerprint = diagnostic.slice(0, 2000);
    if (fingerprint && fingerprint === previousFingerprint) {
      return { success: false, attempts: [...attempts, attemptRecord], summary: "Stopped after a repeated failure diagnostic.", evidence };
    }
    previousFingerprint = fingerprint;
    attempts.push(attemptRecord);
  }
  return { success: false, attempts, summary: `Unable to verify the implementation after ${attempts.length} attempt(s).`, evidence };
}
