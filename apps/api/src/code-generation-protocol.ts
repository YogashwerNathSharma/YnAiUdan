import type { LlmProvider } from "./llm-provider.js";

export type GeneratedPatch = {
  path: string;
  operation: "create" | "update" | "delete";
  content?: string;
};

export type StructuredCodeResult = {
  summary: string;
  plan: string[];
  patches: GeneratedPatch[];
  model: string;
};

export async function generateStructuredCode(provider: LlmProvider, input: { task: string; files: string[]; model?: string }): Promise<StructuredCodeResult> {
  const model = input.model ?? "mock";
  const response = await provider.chat({
    model,
    messages: [
      { role: "system", content: "Return structured code generation output. Do not invent repository files. If the requested change cannot be safely determined, return no patches." },
      { role: "user", content: `Task:\n${input.task}\n\nRepository files:\n${input.files.join("\n")}` }
    ],
    maxTokens: 12000
  });

  let parsed: Partial<StructuredCodeResult>;
  try {
    parsed = JSON.parse(response.content) as Partial<StructuredCodeResult>;
  } catch {
    return { summary: response.content, plan: [], patches: [], model: response.model || model };
  }

  const patches = Array.isArray(parsed.patches) ? parsed.patches.filter((patch): patch is GeneratedPatch => Boolean(patch && typeof patch === "object" && typeof patch.path === "string" && (patch.operation === "create" || patch.operation === "update" || patch.operation === "delete"))) : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    plan: Array.isArray(parsed.plan) ? parsed.plan.filter((item): item is string => typeof item === "string") : [],
    patches,
    model: typeof parsed.model === "string" ? parsed.model : response.model || model
  };
}
