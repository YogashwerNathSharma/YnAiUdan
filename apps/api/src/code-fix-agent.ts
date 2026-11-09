import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { executeTool } from "./tool-executor.js";
import type { AutonomyMode } from "./permissions.js";
import { resolveRoot, safeJoin } from "./workspace-root.js";
import { githubRegistry } from "./github-agent.js";

/**
 * Autonomous code-fix agent.
 *
 * Gives the chat AI the same abilities the user has in the Computer Access
 * panel: it can list the workspace, read files, edit/save files and run
 * allowlisted dev commands — in a loop — so it can read code and fix bugs
 * on its own. All writes/commands go through executeTool() so the existing
 * role + autonomy-mode permission checks still apply.
 */

type AuthPayload = { sub: string; tenantId: string; role: string };

const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

async function listWorkspace(root: string, maxEntries = 400): Promise<Array<{ path: string; type: "file" | "directory" }>> {
  const out: Array<{ path: string; type: "file" | "directory" }> = [];
  async function walk(current: string) {
    if (out.length >= maxEntries) return;
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || out.length >= maxEntries) continue;
      const absolute = path.join(current, entry.name);
      out.push({ path: path.relative(root, absolute), type: entry.isDirectory() ? "directory" : "file" });
      if (entry.isDirectory()) await walk(absolute);
    }
  }
  await fs.mkdir(root, { recursive: true });
  await walk(root);
  return out;
}

/* ---------- AI client (OpenAI + Groq both speak the chat.completions API) ---------- */
// Preference order for Groq coding models — the first one the account actually
// has access to is used. Keeps working even when Groq rotates model names.
const GROQ_MODEL_PREFERENCES = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
  "gemma2-9b-it"
];

let cachedGroqModel: string | null = null;

async function listGroqModels(client: OpenAI): Promise<string[]> {
  try {
    const res = await client.models.list();
    // openai sdk returns an async-iterable / {data:[...]}
    const data = (res as unknown as { data?: Array<{ id: string }> }).data ?? [];
    return data.map(m => m.id);
  } catch {
    return [];
  }
}

// Pick a Groq model the account can actually use. Honours AI_CODING_MODEL if it
// is in the available list; otherwise falls back to the preference order; and
// if the model list cannot be fetched, uses the configured/first preference.
async function resolveGroqModel(client: OpenAI): Promise<string> {
  if (cachedGroqModel) return cachedGroqModel;
  const configured = process.env.AI_CODING_MODEL?.replace(/^groq:/i, "").trim();
  const available = await listGroqModels(client);
  const pick = (id?: string) => id && (available.length === 0 || available.includes(id)) ? id : undefined;
  const chosen =
    pick(configured) ||
    GROQ_MODEL_PREFERENCES.map(pick).find(Boolean) ||
    (available.find(id => /llama|gpt-oss|qwen|gemma/i.test(id))) ||
    configured ||
    GROQ_MODEL_PREFERENCES[0];
  cachedGroqModel = chosen;
  return chosen;
}

async function buildClient(): Promise<{ client: OpenAI; model: string; provider: string }> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  // Local server (Ollama / LM Studio / llama.cpp) — OpenAI-compatible, runs on
  // YOUR PC. No API key needed and no cloud token limits. Set LOCAL_AI_BASE_URL
  // (e.g. http://localhost:11434/v1 for Ollama) and LOCAL_AI_MODEL (e.g. "qwen2.5-coder:3b").
  const localUrl = process.env.LOCAL_AI_BASE_URL?.trim();
  const localModel = process.env.LOCAL_AI_MODEL?.trim();
  const localKey = process.env.LOCAL_AI_API_KEY?.trim() || "ollama"; // most local servers ignore the key
  // Honour the provider chosen in AI_CODING_MODEL (e.g. "openai:gpt-4o-mini",
  // "gemini:gemini-2.0-flash", "groq:llama-3.3-70b-versatile"). Previously this
  // was ignored and Groq was always used whenever GROQ_API_KEY was set, so the
  // configured module never took effect.
  const configuredModel = process.env.AI_CODING_MODEL?.trim();
  const configuredProvider = configuredModel?.includes(":") ? configuredModel.split(":", 1)[0].toLowerCase() : undefined;
  const stripPrefix = (m: string) => m.includes(":") ? m.split(":").slice(1).join(":") : m;

  if (configuredProvider === "local" && localUrl) {
    const client = new OpenAI({ apiKey: localKey, baseURL: localUrl, timeout: 600_000, maxRetries: 1 });
    return { client, model: stripPrefix(configuredModel!) || localModel || "qwen2.5-coder:3b", provider: "local" };
  }
  if (configuredProvider === "openai" && openaiKey) {
    return { client: new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 2 }), model: stripPrefix(configuredModel!) || "gpt-4o-mini", provider: "openai" };
  }
  if (configuredProvider === "gemini" && geminiKey) {
    const client = new OpenAI({ apiKey: geminiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", timeout: 120_000, maxRetries: 2 });
    return { client, model: stripPrefix(configuredModel!) || "gemini-flash-lite-latest", provider: "gemini" };
  }
  if (configuredProvider === "groq" && groqKey) {
    const client = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1", timeout: 120_000, maxRetries: 2 });
    const model = await resolveGroqModel(client);
    return { client, model, provider: "groq" };
  }
  // No explicit provider configured (or its key is missing): fall back to
  // whatever IS available. Prefer the LOCAL server first (free, private, no
  // token limits), then GEMINI (big free tier — avoids Groq's 8000 TPM 413
  // errors), then Groq, then OpenAI.
  if (localUrl) {
    const client = new OpenAI({ apiKey: localKey, baseURL: localUrl, timeout: 600_000, maxRetries: 1 });
    return { client, model: localModel || "qwen2.5-coder:3b", provider: "local" };
  }
  if (geminiKey) {
    const client = new OpenAI({ apiKey: geminiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", timeout: 120_000, maxRetries: 2 });
    return { client, model: process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest", provider: "gemini" };
  }
  if (groqKey) {
    const client = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1", timeout: 120_000, maxRetries: 2 });
    const model = await resolveGroqModel(client);
    return { client, model, provider: "groq" };
  }
  if (openaiKey) {
    return { client: new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 2 }), model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini", provider: "openai" };
  }
  if (geminiKey) {
    const client = new OpenAI({ apiKey: geminiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", timeout: 120_000, maxRetries: 2 });
    return { client, model: "gemini-flash-lite-latest", provider: "gemini" };
  }
  throw new Error("No AI provider configured. Set LOCAL_AI_BASE_URL (for your own Ollama server) or GROQ_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY in the API environment.");
}

export function aiProviderConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL?.trim() || process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
}

const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List all files in the workspace so you can decide what to read. Returns relative paths.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace.",
      parameters: { type: "object", properties: { path: { type: "string", description: "relative path inside the workspace" } }, required: ["path"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file with the full new contents. Use this to fix bugs or change code.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Run an allowlisted dev command (node, npm, pnpm, npx, git, tsc) in the workspace, e.g. to typecheck or install.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "github_read_repo",
      description: "Read a GitHub repository: its metadata and branch list. Use before reading files or pushing. Requires GITHUB_TOKEN configured.",
      parameters: { type: "object", properties: { owner: { type: "string" }, name: { type: "string" } }, required: ["owner", "name"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "github_list_files",
      description: "List all file paths in a GitHub repository (recursive). Use to understand repo structure before reading files or planning fixes.",
      parameters: { type: "object", properties: { owner: { type: "string" }, name: { type: "string" }, ref: { type: "string", description: "optional branch (default main)" } }, required: ["owner", "name"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "github_read_file",
      description: "Read a single file's contents from a GitHub repository.",
      parameters: { type: "object", properties: { owner: { type: "string" }, name: { type: "string" }, path: { type: "string" }, ref: { type: "string", description: "optional branch/tag/sha" } }, required: ["owner", "name", "path"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "github_push",
      description: "Commit and push file changes to a branch on GitHub. Use this to push bug fixes. Creates the branch's commit with the given message. Each change is {path, content} with the COMPLETE new file content.",
      parameters: { type: "object", properties: { owner: { type: "string" }, name: { type: "string" }, branch: { type: "string" }, message: { type: "string" }, changes: { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } }, required: ["owner", "name", "branch", "message", "changes"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "github_pull_request",
      description: "Open a pull request from a head branch into a base branch.",
      parameters: { type: "object", properties: { owner: { type: "string" }, name: { type: "string" }, title: { type: "string" }, head: { type: "string" }, base: { type: "string" }, body: { type: "string" } }, required: ["owner", "name", "title", "head", "base"], additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "diagnostics",
      description: "Run project diagnostics to FIND bugs automatically: TypeScript typecheck and/or build. Returns the list of compiler errors with file, line and message. Call this first when asked to find/fix bugs or make a repo bug-free, then fix each reported error and run diagnostics again to confirm zero errors.",
      parameters: { type: "object", properties: { kind: { type: "string", enum: ["typecheck", "build", "both"], description: "which checks to run (default both)" } }, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_code",
      description: "Search the whole workspace for a text/regex pattern and get matching file paths + line numbers. Use to locate where a symbol, function, string or bug pattern is used before reading/editing.",
      parameters: { type: "object", properties: { pattern: { type: "string" }, glob: { type: "string", description: "optional filename filter e.g. *.ts" } }, required: ["pattern"], additionalProperties: false }
    }
  }
];

type AgentEvent =
  | { type: "step"; tool: string; detail: string }
  | { type: "result"; tool: string; ok: boolean; detail: string }
  | { type: "message"; text: string }
  | { type: "done"; summary: string; changedFiles: string[] }
  | { type: "error"; error: string };

// Keep the agent's running message history under the provider's tokens-per-minute
// cap (Groq free tier is only ~8000 TPM). We ALWAYS keep the system prompt and
// the first user instruction, then keep as many of the MOST RECENT turns as fit
// inside a char budget (~4 chars/token). Oversized single tool results (e.g. a
// big file read) are hard-trimmed. Older middle turns are dropped first.
const AGENT_CHARS_PER_TOKEN = 4;
const AGENT_REQUEST_TOKEN_BUDGET = Number(process.env.AGENT_REQUEST_TOKEN_BUDGET ?? 5000);
const AGENT_PER_MSG_CHAR_CAP = Number(process.env.AGENT_PER_MSG_CHAR_CAP ?? 8000);

function msgLen(m: OpenAI.Chat.Completions.ChatCompletionMessageParam): number {
  const c = m.content;
  let n = typeof c === "string" ? c.length : Array.isArray(c) ? JSON.stringify(c).length : 0;
  // tool_calls arguments also cost tokens.
  const anyM = m as unknown as { tool_calls?: Array<{ function?: { arguments?: string } }> };
  if (anyM.tool_calls) for (const t of anyM.tool_calls) n += (t.function?.arguments?.length ?? 0);
  return n;
}

function trimAgentMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (messages.length === 0) return messages;
  // Hard-cap any single oversized message content (usually a big tool result).
  const capped = messages.map(m => {
    if (typeof m.content === "string" && m.content.length > AGENT_PER_MSG_CHAR_CAP) {
      return { ...m, content: `${m.content.slice(0, AGENT_PER_MSG_CHAR_CAP)}\n…[truncated to fit token budget]` };
    }
    return m;
  });

  const system = capped[0];
  const firstUser = capped.length > 1 ? capped[1] : undefined;
  const tail = capped.slice(firstUser ? 2 : 1);

  const budgetChars = AGENT_REQUEST_TOKEN_BUDGET * AGENT_CHARS_PER_TOKEN;
  let used = msgLen(system) + (firstUser ? msgLen(firstUser) : 0);

  // Walk from the newest message backwards, keeping what fits. IMPORTANT: an
  // assistant tool_calls message and the matching tool results must stay valid,
  // so if we would start the kept window on an orphan "tool" message we drop it.
  const keptRev: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const m = tail[i];
    const len = msgLen(m);
    if (used + len > budgetChars && keptRev.length > 0) break;
    used += len;
    keptRev.push(m);
  }
  let kept = keptRev.reverse();
  // Drop any leading orphan tool/assistant-with-tool_calls boundary issues:
  // the first kept message must not be a bare "tool" role (needs its assistant).
  while (kept.length > 0 && (kept[0] as { role?: string }).role === "tool") kept = kept.slice(1);

  return firstUser ? [system, firstUser, ...kept] : [system, ...kept];
}

export async function* runAgent(params: { instruction: string; role: string; mode: AutonomyMode; maxSteps: number; root?: string; system?: string }): AsyncGenerator<AgentEvent> {
  const built = await buildClient();
  const { client, provider } = built;
  let model = built.model;
  const root = resolveRoot(params.root);
  const changedFiles = new Set<string>();

  const system = params.system ?? [
    "You are the YnAiUdan autonomous coding agent operating directly on the user's workspace.",
    "You CAN and SHOULD use the provided tools to read and modify code yourself — never ask the user to make edits you can make.",
    "Workflow: list_files to orient, read_file the relevant files, reason about the bug, then write_file with the COMPLETE corrected file contents. Run_command (e.g. 'tsc --noEmit') to verify when useful.",
    "Make minimal, targeted changes. Preserve existing code and style. Never invent files that do not exist unless creation is clearly required.",
    "DEPENDENCIES ARE ALREADY INSTALLED. Never run 'npm install', 'pnpm install' or 'npm install <pkg>' — installs are slow and will time out. TypeScript and all tooling are already present. To verify types, run 'npx tsc --noEmit' (or 'pnpm -r typecheck') directly.",
    "Keep tool use efficient: do NOT repeat a command that already failed or timed out. If a command times out once, move on — do not retry it.",
    "You can ALSO work with GitHub when the user gives a repo (owner/name): github_read_repo to inspect it, github_read_file to read files, github_push to commit+push fixes to a branch, and github_pull_request to open a PR. Use these when the user asks to read a repository, push changes, or open a PR.",
    "ADVANCED BUG-FIXING: when asked to find bugs, fix bugs, or make the project bug-free, follow this loop: (1) call diagnostics to get the real compiler errors, (2) use search_code / read_file to locate each one, (3) write_file with the complete corrected file, (4) call diagnostics AGAIN to confirm. Repeat until diagnostics reports zero errors. Do not claim it is fixed until diagnostics is clean. Prefer search_code over guessing file locations.",
    "When the task is complete, stop calling tools and reply with a short summary: what bugs you found, what you changed, and the final diagnostics result."
  ].join(" ");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: params.instruction }
  ];

  for (let step = 0; step < params.maxSteps; step += 1) {
    // Let the client know we're thinking, so the UI never looks frozen.
    yield { type: "step", tool: "model", detail: `thinking (step ${step + 1}/${params.maxSteps})` };
    let completion: OpenAI.Chat.Completions.ChatCompletion | undefined;
    // Try the chosen model; if it is missing/decommissioned (404 / "does not
    // exist" / "decommissioned"), pick the next available model and retry.
    const triedModels = new Set<string>();
    let parseRetries = 0;
    let rateRetries = 0;
    while (!completion) {
      try {
        const MODEL_TIMEOUT_MS = Number(process.env.AGENT_MODEL_TIMEOUT_MS ?? 90_000);
        completion = await Promise.race([
          client.chat.completions.create({ model, messages: trimAgentMessages(messages), tools: toolSchemas, tool_choice: "auto", temperature: 0.1, max_tokens: Number(process.env.AGENT_MAX_TOKENS ?? 2048) }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`AI model timed out after ${MODEL_TIMEOUT_MS}ms (provider busy or rate-limited). Try again or pick a lighter model.`)), MODEL_TIMEOUT_MS))
        ]);
      } catch (error) {
        // The OpenAI SDK throws APIError with useful fields (status, code, and a
        // structured body) that the plain .message often hides (e.g. "404 status
        // code (no body)"). Surface them so we know WHY a provider rejected us.
        const anyErr = error as { status?: number; code?: string; message?: string; error?: { message?: string }; response?: { data?: unknown } };
        const detailParts = [
          anyErr?.status ? `HTTP ${anyErr.status}` : "",
          anyErr?.error?.message || anyErr?.message || "",
          anyErr?.response?.data ? JSON.stringify(anyErr.response.data).slice(0, 400) : ""
        ].filter(Boolean);
        const msg = detailParts.join(" | ") || (error instanceof Error ? error.message : "unknown error");
        // Full dump to the API terminal for debugging.
        console.error(`[agent] ${provider} model=${model} request failed:`, JSON.stringify(anyErr, Object.getOwnPropertyNames(anyErr)).slice(0, 1200));
        const modelGone = /does not exist|decommission|not found|404|do not have access|not supported|invalid model/i.test(msg);
        // Groq sometimes returns "400 Parsing failed" when a small/less-reliable
        // model emits malformed tool-call JSON. This is intermittent, so retry
        // the SAME request a few times — nudging the model usually yields a
        // well-formed tool call on the next attempt. (We stay on the same
        // provider/client to avoid mismatching a model id with the wrong API.)
        const parseFailed = /parsing failed|could not be parsed|failed_generation/i.test(msg);
        if (parseFailed) {
          if (parseRetries < 3) { parseRetries += 1; yield { type: "step", tool: "model", detail: `retrying (parse error ${parseRetries}/3)` }; continue; }
          yield { type: "error", error: `The model kept producing malformed tool calls after 3 retries. Try a more specific instruction (e.g. name one file to fix), or set AI_CODING_MODEL to a stronger model in the API .env.` };
          return;
        }
        triedModels.add(model);
        // Rate limited (429): the provider's free quota for this model was hit.
        // Wait briefly and retry the SAME request a few times; if it keeps
        // happening, fall through to try the next model.
        const rateLimited = /\b429\b|rate limit|resource_exhausted|quota/i.test(msg);
        if (rateLimited) {
          if (rateRetries < 3) {
            rateRetries += 1;
            const waitMs = 2000 * rateRetries;
            yield { type: "step", tool: "model", detail: `rate limited — waiting ${waitMs / 1000}s then retrying (${rateRetries}/3)` };
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          // Exhausted retries on this model: mark it tried so the fallback below
          // moves to a different model.
          yield { type: "step", tool: "model", detail: `quota hit on ${model}, switching model` };
        }
        if (provider === "groq" && modelGone) {
          cachedGroqModel = null;
          const available = await listGroqModels(client);
          const next = GROQ_MODEL_PREFERENCES.find(m => !triedModels.has(m) && (available.length === 0 || available.includes(m)))
            || available.find(id => !triedModels.has(id) && /llama|gpt-oss|qwen|gemma/i.test(id));
          if (next) { yield { type: "step", tool: "model", detail: `switching to ${next}` }; model = next; cachedGroqModel = next; continue; }
          yield { type: "error", error: `No usable Groq model found. Tried: ${[...triedModels].join(", ")}. Available: ${available.join(", ") || "unknown"}. Set AI_CODING_MODEL to one of the available models.` };
          return;
        }
        // Gemini: if the chosen model is missing/unsupported on this key, try the
        // next known-good Gemini model before giving up.
        if (provider === "gemini" && (modelGone || rateLimited)) {
          const GEMINI_FALLBACKS = ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-flash-latest"];
          const next = GEMINI_FALLBACKS.find(m => !triedModels.has(m));
          if (next) { yield { type: "step", tool: "model", detail: `switching to ${next}` }; model = next; continue; }
        }
        yield { type: "error", error: `${provider} request failed: ${msg}` };
        return;
      }
    }

    const choice = completion!.choices[0]?.message;
    if (!choice) { yield { type: "error", error: "Empty AI response" }; return; }

    const calls = choice.tool_calls ?? [];
    if (calls.length === 0) {
      const text = choice.content ?? "Done.";
      yield { type: "message", text };
      yield { type: "done", summary: text, changedFiles: [...changedFiles] };
      return;
    }

    messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: calls });

    for (const call of calls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }

      let resultText = "";
      let ok = true;
      try {
        if (name === "list_files") {
          const files = await listWorkspace(root);
          yield { type: "step", tool: name, detail: `${files.length} entries` };
          // Only send real (non-dir) file paths to the model and cap the count,
          // so a large workspace cannot blow the provider's tokens-per-minute cap.
          const LIST_CAP = Number(process.env.AGENT_LIST_FILES_CAP ?? 150);
          const fileList = files.filter(f => f.type === "file").map(f => f.path);
          const shown = fileList.slice(0, LIST_CAP);
          resultText = fileList.length
            ? shown.join("\n") + (fileList.length > shown.length ? `\n…(+${fileList.length - shown.length} more files not shown; use read_file on a specific path)` : "")
            : "(workspace is empty)";
        } else if (name === "read_file") {
          const rel = String(args.path ?? "");
          yield { type: "step", tool: name, detail: rel };
          const content = await fs.readFile(safeJoin(root, rel), "utf8");
          resultText = content.length > 24_000 ? `${content.slice(0, 24_000)}\n…[truncated]` : content;
        } else if (name === "write_file") {
          const rel = String(args.path ?? "");
          yield { type: "step", tool: name, detail: rel };
          const result = await executeTool({ toolName: "workspace.write", input: { path: rel, content: String(args.content ?? ""), root, mode: params.mode }, role: params.role, mode: params.mode });
          ok = result.ok;
          if (result.ok) { changedFiles.add(rel); resultText = `Wrote ${rel} (${(result as { output: { bytes: number } }).output.bytes} bytes)`; }
          else { resultText = `Write blocked: ${(result as { error: string }).error}`; }
        } else if (name === "run_command") {
          const command = String(args.command ?? "");
          yield { type: "step", tool: name, detail: command };
          const result = await executeTool({ toolName: "terminal.execute", input: { command, root }, role: params.role, mode: params.mode });
          ok = result.ok;
          if (result.ok) { const o = (result as { output: { exitCode: number; stdout: string; stderr: string } }).output; resultText = `exit ${o.exitCode}\n${o.stdout}\n${o.stderr}`.slice(0, 20_000); }
          else { resultText = `Command blocked: ${(result as { error: string }).error}`; }
        } else if (name === "github_read_repo") {
          yield { type: "step", tool: name, detail: `${args.owner}/${args.name}` };
          if (!githubRegistry.configured()) { ok = false; resultText = "GitHub is not configured. Set GITHUB_TOKEN in the API .env to enable GitHub access."; }
          else {
            const repo = { owner: String(args.owner), name: String(args.name) };
            const meta = await githubRegistry.getClient().getRepository(repo);
            const branches = await githubRegistry.getClient().listBranches(repo);
            resultText = JSON.stringify({ repository: meta, branches }).slice(0, 40_000);
          }
        } else if (name === "github_list_files") {
          yield { type: "step", tool: name, detail: `${args.owner}/${args.name}` };
          if (!githubRegistry.configured()) { ok = false; resultText = "GitHub is not configured. Set GITHUB_TOKEN in the API .env."; }
          else {
            const repo = { owner: String(args.owner), name: String(args.name) };
            const client = githubRegistry.getClient() as { getTree?: (r: unknown, ref?: string) => Promise<unknown> };
            if (!client.getTree) { ok = false; resultText = "Repo file listing not supported by this GitHub client."; }
            else { const tree = await client.getTree(repo, args.ref ? String(args.ref) : undefined); resultText = (Array.isArray(tree) ? tree.join("\n") : JSON.stringify(tree)).slice(0, 40_000); }
          }
        } else if (name === "github_read_file") {
          yield { type: "step", tool: name, detail: `${args.owner}/${args.name}:${args.path}` };
          if (!githubRegistry.configured()) { ok = false; resultText = "GitHub is not configured. Set GITHUB_TOKEN in the API .env."; }
          else {
            const repo = { owner: String(args.owner), name: String(args.name) };
            const file = await githubRegistry.getClient().getFile(repo, String(args.path), args.ref ? String(args.ref) : undefined);
            resultText = (typeof file === "string" ? file : JSON.stringify(file)).slice(0, 60_000);
          }
        } else if (name === "github_push") {
          yield { type: "step", tool: name, detail: `${args.owner}/${args.name}@${args.branch}` };
          if (!githubRegistry.configured()) { ok = false; resultText = "GitHub is not configured. Set GITHUB_TOKEN in the API .env."; }
          else if (!["OWNER", "ADMIN", "DEVELOPER"].includes(params.role)) { ok = false; resultText = "Pushing to GitHub requires developer permissions."; }
          else {
            const repo = { owner: String(args.owner), name: String(args.name) };
            const changes = Array.isArray(args.changes) ? (args.changes as Array<{ path: string; content: string }>) : [];
            const res = await githubRegistry.getClient().push(repo, String(args.branch), String(args.message ?? "Update via YnAiUdan"), changes);
            resultText = `Pushed ${changes.length} file(s) to ${args.owner}/${args.name}@${args.branch}. ${JSON.stringify(res)}`.slice(0, 20_000);
          }
        } else if (name === "github_pull_request") {
          yield { type: "step", tool: name, detail: `${args.owner}/${args.name}: ${args.head} -> ${args.base}` };
          if (!githubRegistry.configured()) { ok = false; resultText = "GitHub is not configured. Set GITHUB_TOKEN in the API .env."; }
          else {
            const repo = { owner: String(args.owner), name: String(args.name) };
            const pr = await githubRegistry.getClient().createPullRequest(repo, String(args.title), String(args.head), String(args.base), args.body ? String(args.body) : undefined);
            resultText = `Opened PR: ${JSON.stringify(pr)}`.slice(0, 20_000);
          }
        } else if (name === "diagnostics") {
          const kind = String(args.kind ?? "both");
          yield { type: "step", tool: name, detail: `running ${kind}` };
          const cmds: string[] = [];
          // Use the workspace's own typecheck script (fast, cached) rather than a
          // bare `npx tsc` at the monorepo root, which recompiles everything and
          // frequently exceeds the command timeout.
          if (kind === "typecheck" || kind === "both") cmds.push("pnpm -r typecheck");
          if (kind === "build") cmds.push("pnpm -r build");
          const chunks: string[] = [];
          for (const cmd of cmds) {
            const r = await executeTool({ toolName: "terminal.execute", input: { command: cmd, root }, role: params.role, mode: params.mode });
            if (r.ok) { const o = (r as { output: { exitCode: number; stdout: string; stderr: string } }).output; chunks.push(`$ ${cmd}\n(exit ${o.exitCode})\n${o.stdout}\n${o.stderr}`); }
            else { chunks.push(`$ ${cmd}\nBLOCKED: ${(r as { error: string }).error}`); }
          }
          const joined = chunks.join("\n\n");
          // Extract TS error lines for a concise summary the model can act on.
          const errs = joined.split(/\r?\n/).filter(l => /error TS\d+:|: error|: warning/i.test(l));
          resultText = (errs.length ? `Found ${errs.length} diagnostic(s):\n${errs.join("\n")}\n\n` : "No compiler errors found. ") + `Raw:\n${joined}`;
          resultText = resultText.slice(0, 30_000);
          ok = true;
        } else if (name === "search_code") {
          const pattern = String(args.pattern ?? "");
          const glob = args.glob ? String(args.glob) : "";
          yield { type: "step", tool: name, detail: pattern + (glob ? ` (${glob})` : "") };
          const files = await listWorkspace(root, 2000);
          const globRe = glob ? new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
          let re: RegExp;
          try { re = new RegExp(pattern, "i"); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
          const hits: string[] = [];
          for (const f of files) {
            if (f.type !== "file") continue;
            if (globRe && !globRe.test(f.path.split(/[\\/]/).pop() || f.path)) continue;
            let content = "";
            try { content = await fs.readFile(safeJoin(root, f.path), "utf8"); } catch { continue; }
            const lines2 = content.split(/\r?\n/);
            for (let li = 0; li < lines2.length; li += 1) {
              if (re.test(lines2[li])) { hits.push(`${f.path}:${li + 1}: ${lines2[li].trim().slice(0, 200)}`); if (hits.length >= 200) break; }
            }
            if (hits.length >= 200) break;
          }
          resultText = hits.length ? hits.join("\n").slice(0, 30_000) : `No matches for /${pattern}/`;
          ok = true;
        } else {
          ok = false; resultText = `Unknown tool: ${name}`;
        }
      } catch (error) {
        ok = false;
        resultText = error instanceof Error ? error.message : "Tool failed";
      }

      yield { type: "result", tool: name, ok, detail: resultText.slice(0, 300) };
      messages.push({ role: "tool", tool_call_id: call.id, content: resultText.slice(0, Number(process.env.AGENT_TOOL_RESULT_CAP ?? 16_000)) });
    }
  }

  yield { type: "error", error: `Reached step limit (${params.maxSteps}) without finishing. Try a more specific instruction.` };
}

const agentSchema = z.object({
  instruction: z.string().trim().min(1).max(10_000),
  root: z.string().max(1000).optional(),
  mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("AUTONOMOUS"),
  maxSteps: z.number().int().min(1).max(40).default(16)
});

export async function registerCodeFixAgentRoutes(app: FastifyInstance): Promise<void> {
  // Streaming SSE endpoint so the panel can show the agent working live.
  app.post("/api/v1/coding/agent", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = agentSchema.parse(request.body);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "http://localhost:5173",
      "Access-Control-Allow-Credentials": "true"
    });
    const write = (event: AgentEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      for await (const event of runAgent({ instruction: input.instruction, root: input.root, role: auth.role, mode: input.mode, maxSteps: input.maxSteps })) {
        write(event);
      }
    } catch (error) {
      write({ type: "error", error: error instanceof Error ? error.message : "Agent failed" });
    } finally {
      reply.raw.end();
    }
  });
}
