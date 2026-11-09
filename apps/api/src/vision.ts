import OpenAI from "openai";

/**
 * Image understanding (vision) for the chat box.
 *
 * Lets the user attach a screenshot/image and have the AI read & understand it,
 * then act on it (e.g. fix the code it shows). Uses a vision-capable model on
 * whichever provider is configured:
 *   - Groq: Llama 4 (scout / maverick) support image input.
 *   - OpenAI: gpt-4o / gpt-4o-mini support image input.
 *
 * Input images are data URLs (data:image/...;base64,....) sent from the browser.
 */

// Groq vision-capable models, in preference order. Groq rotates these often and
// decommissions old ones (llama-3.2-*-vision-preview and some llama-4 builds are
// gone / access-gated), so we DO NOT trust this static list blindly: at runtime
// we fetch the account's actual model list and pick whatever vision model it has.
// This list is only the preference order + last-resort fallback. An env override
// (GROQ_VISION_MODEL) always wins if set.
const GROQ_VISION_MODELS = [
  "qwen/qwen3.8-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "llava-v1.5-7b-4096-preview"
];

// Heuristic: does a model id look like it can accept image input?
// Broadened to cover current multimodal families (qwen-VL/qwen3.x, llava, llama-4,
// gemma vision, pixtral, maverick/scout) so newly-added Groq vision models are
// auto-detected without another code change.
function looksVisionCapable(id: string): boolean {
  const s = id.toLowerCase();
  if (/whisper|tts|guard|embed|moderation/.test(s)) return false; // definitely NOT vision
  return (
    s.includes("vision") ||
    s.includes("llava") ||
    s.includes("llama-4") ||
    s.includes("scout") ||
    s.includes("maverick") ||
    s.includes("pixtral") ||
    s.includes("qwen") && (s.includes("vl") || /qwen3(\.|-)/.test(s)) ||
    s.includes("gemma") && s.includes("vision")
  );
}

let cachedVision: { model: string; provider: string } | null = null;

export function visionAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

function client(): { client: OpenAI; provider: "groq" | "openai" } {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (groqKey) return { client: new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1", timeout: 120_000, maxRetries: 2 }), provider: "groq" };
  if (openaiKey) return { client: new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 2 }), provider: "openai" };
  throw new Error("No AI provider configured for vision. Set GROQ_API_KEY or OPENAI_API_KEY.");
}

// Build a client for a SPECIFIC provider (used to try Groq, then OpenAI).
function clientFor(provider: "groq" | "openai"): OpenAI | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (provider === "groq" && groqKey) return new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1", timeout: 120_000, maxRetries: 2 });
  if (provider === "openai" && openaiKey) return new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 2 });
  return null;
}

async function pickVisionModel(c: OpenAI, provider: "groq" | "openai"): Promise<string> {
  if (cachedVision && cachedVision.provider === provider) return cachedVision.model;
  if (provider === "openai") {
    const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
    cachedVision = { model, provider };
    return model;
  }
  // Groq: env override wins, otherwise discover a vision model from the account.
  const override = process.env.GROQ_VISION_MODEL?.trim();
  if (override) { cachedVision = { model: override, provider }; return override; }
  let available: string[] = [];
  try {
    const res = await c.models.list();
    available = ((res as unknown as { data?: Array<{ id: string }> }).data ?? []).map(m => m.id);
  } catch { /* ignore — fall back to preference list */ }
  const preferred = GROQ_VISION_MODELS.find(m => available.includes(m));
  const discovered = available.find(looksVisionCapable);
  const model = preferred || discovered || GROQ_VISION_MODELS[0];
  cachedVision = { model, provider };
  return model;
}

/**
 * Describe one or more images in detail, focused on anything actionable for a
 * developer (UI shown, errors/stack traces, code visible, what looks wrong).
 * Returns a plain-text description the coding agent can then act on.
 */
export async function describeImages(images: string[], userPrompt: string): Promise<{ description: string; model: string }> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        "Look at the attached screenshot(s). Describe precisely what is shown, focusing on what a developer needs: " +
        "visible UI and its state, any error messages or stack traces (transcribe them EXACTLY), any code or file names visible, and what appears wrong or intended. " +
        (userPrompt ? `The user's request: "${userPrompt}". ` : "") +
        "Keep it concise (a short paragraph) but complete."
    },
    ...images.map(url => ({ type: "image_url", image_url: { url } }))
  ];

  // Build the candidate model list for ONE provider.
  async function candidatesFor(c: OpenAI, provider: "groq" | "openai"): Promise<string[]> {
    const candidates: string[] = [];
    if (provider === "openai") {
      const configured = process.env.OPENAI_VISION_MODEL?.trim();
      candidates.push(configured || "gpt-4o-mini", "gpt-4o");
    } else {
      const override = process.env.GROQ_VISION_MODEL?.trim();
      if (override) candidates.push(override);
      let available: string[] = [];
      try { available = ((await c.models.list() as unknown as { data?: Array<{ id: string }> }).data ?? []).map(m => m.id); } catch { /* ignore */ }
      for (const m of GROQ_VISION_MODELS) if (available.includes(m) && !candidates.includes(m)) candidates.push(m);
      for (const m of available) if (looksVisionCapable(m) && !candidates.includes(m)) candidates.push(m);
      if (available.length === 0) for (const m of GROQ_VISION_MODELS) if (!candidates.includes(m)) candidates.push(m);
    }
    return candidates;
  }

  // Try a single provider across all its candidate models.
  async function tryProvider(provider: "groq" | "openai"): Promise<{ description: string; model: string } | { err: string }> {
    const c = clientFor(provider);
    if (!c) return { err: `${provider} not configured` };
    const candidates = await candidatesFor(c, provider);
    let lastErr = "no candidate models";
    for (const model of candidates) {
      try {
        const completion = await c.chat.completions.create({ model, messages: [{ role: "user", content: content as never }], temperature: 0.2, max_tokens: 1024 });
        return { description: completion.choices[0]?.message?.content ?? "(no description)", model: `${provider}:${model}` };
      } catch (error) {
        lastErr = error instanceof Error ? error.message : "unknown error";
        // model-availability error → next candidate; anything else → stop this provider
        if (!/does not exist|decommission|not found|404|do not have access/i.test(lastErr)) break;
      }
    }
    return { err: `${provider}: ${lastErr}` };
  }

  // Prefer Groq (fast/free) then fall back to OpenAI if Groq has no working
  // vision model. This is the key advanced behaviour: image reading keeps
  // working as long as EITHER provider has a vision model.
  const errors: string[] = [];
  for (const provider of ["groq", "openai"] as const) {
    const res = await tryProvider(provider);
    if ("description" in res) return res;
    errors.push(res.err);
  }
  throw new Error(
    `Could not read the image. ${errors.join(" | ")}. ` +
    `Fix: set GROQ_VISION_MODEL to a current id from https://console.groq.com/docs/vision (e.g. qwen/qwen3.8-27b), ` +
    `or add OPENAI_API_KEY for gpt-4o-mini vision.`
  );
}