import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { executeModelStream } from "./model-stream-execution.js";
import { resolveChatContext } from "./context-resolver.js";
import { recordAIUsage } from "./ai-usage.js";
import { isDbDisabled } from "./dev-auth-store.js";
import { devConversationStore } from "./dev-conversation-store.js";
import { runAgent, aiProviderConfigured } from "./code-fix-agent.js";
import { describeImages, visionAvailable } from "./vision.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const schema = z.object({
  conversationId: z.string().min(1).max(64),
  model: z.string().trim().min(1).max(100).optional(),
  message: z.string().trim().max(100_000).default(""),
  root: z.string().max(1000).optional(),
  images: z.array(z.string().max(12_000_000)).max(6).optional()
});
const providerFromModel = (model: string) => model.includes(":") ? model.split(":", 1)[0] : "openai";

// How much prior conversation to replay as memory.
//
// IMPORTANT: the FULL history is always kept on disk — nothing is ever
// forgotten/lost. These limits only control how much of it we REPLAY to the
// model on each request, which must stay under the provider's tokens-per-minute
// cap (Groq free tier is only ~8000 TPM). So we keep lots of messages but trim
// their total size to fit the budget, newest-first.
const HISTORY_MESSAGES = Number(process.env.CHAT_HISTORY_MESSAGES ?? 200);
const HISTORY_CHAR_BUDGET = Number(process.env.CHAT_HISTORY_CHAR_BUDGET ?? 16000); // total chars across replayed history
const PER_MESSAGE_CHAR_CAP = Number(process.env.CHAT_HISTORY_PER_MESSAGE_CAP ?? 4000); // cap any single long message

// Rough token estimate (≈ 4 chars/token for English). Used to keep the whole
// request under the provider TPM cap so we never hit a 413 "request too large".
const CHARS_PER_TOKEN = 4;
const REQUEST_TOKEN_BUDGET = Number(process.env.CHAT_REQUEST_TOKEN_BUDGET ?? 6000); // leave room for the reply under an 8000 TPM cap
const estTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

function trimHistory(msgs: ChatMsg[]): ChatMsg[] {
  // Keep the most recent messages within the char budget.
  const recent = msgs.slice(-HISTORY_MESSAGES).map(m => ({
    role: m.role,
    content: m.content.length > PER_MESSAGE_CHAR_CAP ? `${m.content.slice(0, PER_MESSAGE_CHAR_CAP)}…[truncated]` : m.content
  }));
  const out: ChatMsg[] = [];
  let budget = HISTORY_CHAR_BUDGET;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const c = recent[i];
    budget -= c.content.length;
    if (budget < 0 && out.length > 0) break;
    out.unshift(c);
  }
  return out;
}

// Final safety net: drop the OLDEST replayed messages until the whole request
// (system + history + new user turn) fits under REQUEST_TOKEN_BUDGET. The system
// prompt and the latest user message are always kept.
function fitToTokenBudget(messages: ChatMsg[]): ChatMsg[] {
  if (messages.length <= 2) return messages;
  const system = messages[0];
  const latest = messages[messages.length - 1];
  const middle = messages.slice(1, -1);
  let total = estTokens(system.content) + estTokens(latest.content) + middle.reduce((a, m) => a + estTokens(m.content), 0);
  while (total > REQUEST_TOKEN_BUDGET && middle.length > 0) {
    const dropped = middle.shift()!;
    total -= estTokens(dropped.content);
  }
  // If still over budget (huge single user turn), hard-trim the latest message.
  if (total > REQUEST_TOKEN_BUDGET) {
    const allowed = Math.max(500, REQUEST_TOKEN_BUDGET - estTokens(system.content)) * CHARS_PER_TOKEN;
    if (latest.content.length > allowed) latest.content = `${latest.content.slice(0, allowed)}…[truncated]`;
  }
  return [system, ...middle, latest];
}

// Load prior messages for this conversation (DB or in-memory dev store).
async function loadHistory(conversationId: string, auth: AuthPayload, dbOff: boolean): Promise<ChatMsg[]> {
  try {
    if (dbOff) {
      const conv = devConversationStore.find(conversationId, auth.sub);
      if (!conv) return [];
      return conv.messages.map(m => ({ role: m.role === "ASSISTANT" ? "assistant" : "user", content: m.content }));
    }
    const rows = await db.message.findMany({
      where: { conversationId, conversation: { userId: auth.sub } },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true }
    });
    return rows.map(m => ({ role: m.role === "ASSISTANT" ? "assistant" : "user", content: m.content }));
  } catch {
    return [];
  }
}

// Render history as a plain-text transcript (for the agent, which takes a single instruction string).
function historyAsTranscript(history: ChatMsg[]): string {
  if (history.length === 0) return "";
  return history.map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`).join("\n");
}

function wantsComputerAccess(text: string): boolean {
  const t = text.toLowerCase();

  // 1) Strong phrases / targets that almost always mean "work on my files".
  const kw = [
    // Workspace / project targets.
    "my pc", "my computer", "my files", "my project", "my code", "workspace",
    "codebase", "code base", "repository", "the project", "this project",
    "the code", "this code", "the app", "the frontend", "the backend",
    "the component", "the function", "the file", "this file",
    // Explicit file operations.
    "fix the", "fix a ", "the bug", "a bug", "refactor", "edit the", "edit file",
    "change the code", "update the code", "read the file", "read file", "list files",
    "open the file", "open file", "create a file", "new file", "delete the file",
    "rename the file", "move the file", "search the code", "find in files",
    "where is", "which file", "what files",
    // Build / test / tooling intents.
    "typecheck", "type check", "run the build", "run tests", "run the tests",
    "install the", "add a dependency", "the error", "an error", "stack trace",
    "not working", "doesn't work", "does not work", "broken", "crash",
    // Hinglish / Hindi intents (user writes in Hinglish).
    "padho", "padh", "likho", "likh do", "banao", "bana do", "theek karo",
    "thik karo", "sahi karo", "badlo", "badal do", "dikhao", "khol", "kholo",
    "file padh", "code padh", "code likh", "code banao", "error aa raha",
    "chal nahi", "kaam nahi kar",
    // File-extension references signal a concrete file target.
    ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".md", ".py",
    ".yaml", ".yml", ".prisma", ".env"
  ];
  if (kw.some(k => t.includes(k))) return true;

  // 2) Word-boundary matches for short, ambiguous terms so they don't fire
  // inside unrelated words (e.g. "fix" in "prefix", "run" in "running").
  if (/\b(repo|npm|pnpm|npx|tsc|node|git|build|debug|lint|compile|deploy|bug|bugs)\b/.test(t)) return true;

  // 3) Intent heuristic: a "coding verb" + a "code noun" in the same message
  // strongly implies file work even without an exact phrase above. This is what
  // makes the agent fire on natural requests like "add a button to the header"
  // or "make the login page responsive".
  const verb = /\b(fix|debug|refactor|implement|add|create|build|make|change|update|modify|edit|improve|optimi[sz]e|rename|remove|delete|write|review|check|test|run|generate|convert|migrate|rewrite|wire up|hook up|integrate|connect|style|format)\b/.test(t);
  const noun = /\b(code|coding|function|functions|method|class|classes|component|components|module|modules|file|files|folder|directory|variable|import|imports|export|route|routes|endpoint|api|handler|button|page|form|style|styles|css|script|bug|error|errors|test|tests|type|types|interface|schema|config|feature|logic)\b/.test(t);
  if (verb && noun) return true;

  return false;
}

export async function registerChatStreamRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat/stream", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const input = schema.parse(request.body);
    const hasImages = Boolean(input.images && input.images.length);
    if (!input.message && !hasImages) return reply.code(400).send({ error: "Message or image is required" });
    const dbOff = isDbDisabled();
    let systemContext = ""; let characters = 0; let truncated = false; let selectedMemoryIds: string[] = [];

    // Load prior conversation BEFORE persisting the new user message, so history
    // is the actual earlier turns (this is what gives the chat its memory).
    const history = trimHistory(await loadHistory(input.conversationId, auth, dbOff));

    if (dbOff) {
      // Ensure the conversation exists in the dev store and record the user turn.
      devConversationStore.addMessage(input.conversationId, auth.sub, "USER", input.message || (hasImages ? "[image attached]" : ""));
    } else {
      const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } } });
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message || (hasImages ? "[image attached]" : "") } });
      const context = await resolveChatContext({ conversationId: conversation.id, userId: auth.sub, tenantId: auth.tenantId });
      systemContext = context.systemContext; characters = context.characters; truncated = context.truncated; selectedMemoryIds = context.selectedMemoryIds;
    }

    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "http://localhost:5173", "Access-Control-Allow-Credentials": "true" });
    const writeText = (text: string) => reply.raw.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
    // Emit a structured event (tool step / result) so the chat UI can render it
    // as its own card instead of mixing it into the assistant text.
    const writeEvent = (obj: Record<string, unknown>) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    let final = ""; let providerModel = input.model ?? "router"; let usage: { inputTokens?: number; outputTokens?: number } | undefined; const startedAt = Date.now();

    // ---- Vision step: read & understand attached images first. ----
    let imageUnderstanding = "";
    if (hasImages) {
      if (!visionAvailable()) {
        writeText("\n\u26a0\ufe0f No AI provider configured for image reading. Set GROQ_API_KEY or OPENAI_API_KEY.\n");
      } else {
        try {
          writeText("\n\u{1f5bc}\ufe0f Reading the attached image\u2026\n");
          const res = await describeImages(input.images as string[], input.message);
          imageUnderstanding = res.description;
          writeText(`\n${imageUnderstanding}\n`);
          final += imageUnderstanding;
        } catch (error) {
          writeText(`\n\u274c Could not read the image: ${error instanceof Error ? error.message : "unknown error"}\n`);
        }
      }
    }

    const effectiveMessage = [
      input.message,
      imageUnderstanding ? `\n\n[What the attached image shows]\n${imageUnderstanding}` : ""
    ].filter(Boolean).join("");

    // ---- Agentic path ----
    const useAgent = aiProviderConfigured() && (Boolean(input.root) || wantsComputerAccess(effectiveMessage));
    if (useAgent) {
      try {
        const transcript = historyAsTranscript(history);
        const system = [
          "You are YnAiUdan, an AI assistant with DIRECT ACCESS to the user's computer workspace through tools (list_files, read_file, write_file, run_command).",
          "NEVER say you cannot access files, folders or a computer — you can, via the tools. Never ask the user to paste code or share a document; read it yourself with the tools.",
          input.root ? `The user has selected this folder to work on: ${input.root}. Treat it as the project root.` : "Work on the configured workspace folder.",
          imageUnderstanding ? "The user attached an image; a detailed description of it is included in the request." : "",
          "Do NOT try to install image libraries (sharp, jimp, etc.) or run package managers to edit images. Simple image edits (grayscale, invert, rotate, flip, brightness, resize, white background) are handled directly in the chat UI — if the user wants such an edit, tell them to attach the image and type the edit (e.g. \"make it grayscale\"). Only use code/tools for edits that genuinely require project code changes.",
          transcript ? `Here is the earlier conversation so you remember the context:\n${transcript}\n` : "",
          "When asked to read/review a project: FIRST call list_files, then read_file the important files, then report findings.",
          "When asked to fix: read the relevant files, then write_file with the COMPLETE corrected file contents.",
          "Explain briefly what you are doing, then finish with a short summary."
        ].filter(Boolean).join(" ");
        for await (const event of runAgent({ instruction: effectiveMessage || "Act on the attached image.", role: auth.role, mode: "AUTONOMOUS", maxSteps: 30, root: input.root, system })) {
          if (event.type === "step") writeEvent({ type: "step", tool: event.tool, detail: event.detail });
          else if (event.type === "result") writeEvent({ type: "result", tool: event.tool, ok: event.ok, detail: event.detail });
          else if (event.type === "message") { final += event.text; writeText(event.text); }
          else if (event.type === "done") {
            writeEvent({ type: "changed", changedFiles: event.changedFiles });
            // If the agent produced a summary but never emitted it as a message
            // (e.g. it ended after tool steps), keep it so the reply is saved to
            // history instead of a bare "(done)" — this is what gives the next
            // turn its memory of what happened.
            if (!final.trim() && event.summary && event.summary.trim()) { final += event.summary; writeText(event.summary); }
          }
          else if (event.type === "error") { final += `\n\u274c ${event.error}`; writeText(`\n\u274c ${event.error}`); }
        }
        providerModel = process.env.AI_CODING_MODEL ?? (process.env.LOCAL_AI_BASE_URL ? `local:${process.env.LOCAL_AI_MODEL ?? "model"}` : process.env.GROQ_API_KEY ? "groq" : "openai");
        persistAssistant(dbOff, input.conversationId, auth, final || "(done)", providerModel);
        reply.raw.write(`data: ${JSON.stringify({ type: "done", messageId: "agent", model: providerModel, context: { characters, truncated, memories: selectedMemoryIds.length } })}\n\n`);
      } catch (error) {
        reply.raw.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Agent failed" })}\n\n`);
      } finally { reply.raw.end(); }
      return;
    }

    if (hasImages && !useAgent) {
      persistAssistant(dbOff, input.conversationId, auth, final || "(image read)", "vision");
      reply.raw.write(`data: ${JSON.stringify({ type: "done", messageId: "vision", model: "vision", context: { characters, truncated, memories: selectedMemoryIds.length } })}\n\n`);
      reply.raw.end();
      return;
    }

    // ---- Normal chat path (plain text model stream) — now WITH history ----
    const messages: ChatMsg[] = fitToTokenBudget([
      { role: "system", content: `You are YnAiUdan. You remember and use the earlier messages in this conversation. Never claim a tool was used without a tool result.\n\n${systemContext}` },
      ...history,
      { role: "user", content: effectiveMessage }
    ]);
    try {
      for await (const event of executeModelStream({ task: "chat", requestedModel: input.model, messages })) {
        if (event.type === "text") { final += event.text ?? ""; writeText(event.text ?? ""); }
        if (event.type === "done" && event.response) { providerModel = event.response.model; usage = event.response.usage; }
      }
      if (!dbOff) {
        await recordAIUsage({ tenantId: auth.tenantId, userId: auth.sub, taskType: "chat_stream", provider: providerFromModel(providerModel), model: providerModel, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, latencyMs: Date.now() - startedAt, success: true });
      }
      const assistantId = persistAssistant(dbOff, input.conversationId, auth, final, providerModel);
      reply.raw.write(`data: ${JSON.stringify({ type: "done", messageId: assistantId, model: providerModel, context: { characters, truncated, memories: selectedMemoryIds.length } })}\n\n`);
    } catch (error) {
      if (!dbOff) {
        await recordAIUsage({ tenantId: auth.tenantId, userId: auth.sub, taskType: "chat_stream", provider: providerFromModel(providerModel), model: providerModel, latencyMs: Date.now() - startedAt, success: false, error: error instanceof Error ? error.message : "Streaming request failed" });
      }
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Streaming request failed" })}\n\n`);
    } finally { reply.raw.end(); }
  });
}

// Persist the assistant reply so it becomes part of the memory for next turn.
function persistAssistant(dbOff: boolean, conversationId: string, auth: AuthPayload, content: string, model: string): string {
  if (dbOff) {
    const m = devConversationStore.addMessage(conversationId, auth.sub, "ASSISTANT", content);
    return m?.id ?? "dev";
  }
  // Fire-and-forget DB write (do not block the SSE close on it).
  db.message.create({ data: { conversationId, role: "ASSISTANT", content, model } }).catch(() => undefined);
  return "db";
}
