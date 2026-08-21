import { z } from "zod";
import type { LlmProvider, LlmMessage } from "./llm-provider.js";
import type { LlmPatch } from "./llm-coder.js";

const patchSchema = z.object({ path: z.string().min(1), content: z.string(), status: z.enum(["added", "modified", "deleted"]).optional() });
const responseSchema = z.object({ summary: z.string().min(1), plan: z.array(z.string()).min(1).max(20), patches: z.array(patchSchema).max(100) });
export type CodeGenerationResult = { summary: string; plan: string[]; patches: LlmPatch[]; model?: string };

export async function generateStructuredCode(provider: LlmProvider, input: { task: string; files: Array<{ path: string; content: string }>; model?: string }): Promise<CodeGenerationResult> {
  const messages: LlmMessage[] = [
    { role: "system", content: "You are a software engineering code generator. Return ONLY valid JSON with keys summary, plan, patches. Each patch must contain path and complete file content; status may be added, modified, or deleted. Never use paths beginning with / or containing .. ." },
    { role: "user", content: JSON.stringify({ task: input.task, files: input.files }) }
  ];
  const result = await provider.generate({ messages, model: input.model, temperature: 0.1 });
  let parsed: unknown;
  try { parsed = JSON.parse(result.text); } catch { throw new Error("LLM returned non-JSON code generation output"); }
  const normalized = responseSchema.parse(parsed);
  for (const patch of normalized.patches) {
    if (patch.path.startsWith("/") || patch.path.split("/").includes("..")) throw new Error(`Unsafe generated path: ${patch.path}`);
    if (patch.content.length > 2_000_000) throw new Error(`Generated patch too large: ${patch.path}`);
  }
  return { ...normalized, model: result.model };
}
