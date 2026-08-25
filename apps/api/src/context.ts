import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";

const item = z.object({ id: z.string().optional(), role: z.string().optional(), key: z.string().optional(), content: z.string().max(20_000), importance: z.number().min(0).max(1).default(0.5) });
const schema = z.object({ project: z.object({ name: z.string(), instructions: z.string().max(20_000).optional() }).optional(), task: z.object({ goal: z.string().max(20_000), status: z.string().optional() }).optional(), messages: z.array(item).max(200).default([]), memories: z.array(item).max(200).default([]), maxChars: z.number().int().min(2_000).max(200_000).default(60_000) });
export type ContextInput = z.infer<typeof schema>;
export type ContextResult = { systemContext: string; selectedMemoryIds: string[]; includedMessageIds: string[]; truncated: boolean; characters: number; compression: { applied: boolean; omittedMessageCount: number; omittedMemoryCount: number } };

const STOP_WORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "have", "will", "are", "you", "your", "please", "continue", "next", "karo", "ko", "hai", "me", "mein", "ka", "ki", "ke", "is"]);
function termsFor(goal: string): string[] { return [...new Set(goal.toLowerCase().split(/[^a-z0-9_]+/).filter(term => term.length >= 3 && !STOP_WORDS.has(term)))].slice(0, 80); }
function relevance(item: z.infer<typeof item>, terms: string[]): number { if (!terms.length) return 0; const key = (item.key ?? "").toLowerCase(); const text = `${key} ${item.content}`.toLowerCase(); return terms.reduce((score, term) => score + (key.includes(term) ? 3 : text.includes(term) ? 1 : 0), 0); }
function rank(items: z.infer<typeof item>[], goal: string): z.infer<typeof item>[] { const terms = termsFor(goal); return [...items].map(item => ({ item, score: relevance(item, terms), importance: item.importance ?? 0.5 })).sort((a, b) => (b.score * 3 + b.importance) - (a.score * 3 + a.importance)).map(entry => entry.item); }

export function buildContext(input: ContextInput): ContextResult {
  const max = input.maxChars; const goal = input.task?.goal ?? ""; let used = 0; let truncated = false; const sections: string[] = []; const selectedMemoryIds: string[] = []; const includedMessageIds: string[] = []; let omittedMessageCount = 0; let omittedMemoryCount = 0;
  const add = (text: string, id?: string, kind?: "memory" | "message") => { if (!text) return true; if (used + text.length > max) { truncated = true; return false; } sections.push(text); used += text.length; if (id && kind === "memory") selectedMemoryIds.push(id); if (id && kind === "message") includedMessageIds.push(id); return true; };
  if (input.project) add(`PROJECT\nName: ${input.project.name}\nInstructions: ${input.project.instructions ?? "None"}`);
  if (input.task) add(`TASK\nStatus: ${input.task.status ?? "UNKNOWN"}\nGoal: ${input.task.goal}`);
  const rankedMemories = rank(input.memories, goal); for (let index = 0; index < rankedMemories.length; index += 1) { if (!add(`MEMORY\n${rankedMemories[index].key ?? ""}: ${rankedMemories[index].content}`, rankedMemories[index].id, "memory")) { omittedMemoryCount = rankedMemories.length - index; break; } }
  const rankedMessages = [...input.messages].reverse(); for (let index = 0; index < rankedMessages.length; index += 1) { if (!add(`CONVERSATION\n${rankedMessages[index].role ?? "message"}: ${rankedMessages[index].content}`, rankedMessages[index].id, "message")) { omittedMessageCount = rankedMessages.length - index; break; } }
  return { systemContext: sections.join("\n\n"), selectedMemoryIds, includedMessageIds, truncated, characters: used, compression: { applied: omittedMessageCount > 0 || omittedMemoryCount > 0, omittedMessageCount, omittedMemoryCount } };
}

export async function registerContextRoutes(app: FastifyInstance): Promise<void> { app.post("/api/v1/context/build", { preHandler: authenticate }, async request => { const input = schema.parse(request.body); return buildContext(input); }); }
