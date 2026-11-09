import type { FastifyInstance } from "fastify";
import { z } from "zod";
import OpenAI from "openai";
import { authenticate } from "./auth.js";
import { executeModel } from "./model-execution.js";

/**
 * Image generation for the chat box.
 *
 * Strategy (first that works wins):
 *   1. OpenAI Images (gpt-image-1 / DALL·E) when OPENAI_API_KEY is set.
 *   2. Pollinations.ai — a free, key-less text-to-image endpoint. We try the
 *      high-quality `flux` model first and fall back to the much faster
 *      `turbo` model if flux is slow or rate-limited.
 *
 * In BOTH cases the image bytes are fetched server-side and returned as a
 * data: URL. That means the actual generated picture is captured at creation
 * time and stored in the conversation — it does NOT re-fetch a live URL later
 * (which is what caused the same "free limit reached" placeholder to keep
 * showing up). Each request uses a fresh random seed so repeated prompts give
 * different pictures.
 */

const schema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  size: z.enum(["512", "768", "1024"]).optional(),
  // Optional explicit dimensions (override size). Lets the UI request
  // portrait / landscape / wide images, not just squares.
  width: z.number().int().min(256).max(1536).optional(),
  height: z.number().int().min(256).max(1536).optional(),
  // Optional style preset that is appended to the prompt for a consistent look.
  style: z.enum(["photo", "digital-art", "anime", "3d", "logo", "sketch", "watercolor", "cinematic"]).optional()
});

const STYLE_SUFFIX: Record<string, string> = {
  "photo": "photorealistic, DSLR photo, natural lighting, ultra detailed",
  "digital-art": "digital art, vibrant colors, highly detailed illustration, artstation trending",
  "anime": "anime style, clean line art, cel shading, studio-quality",
  "3d": "3d render, octane render, soft shadows, physically based materials",
  "logo": "clean vector logo, flat design, minimal, high contrast, centered",
  "sketch": "pencil sketch, hand drawn, detailed shading",
  "watercolor": "watercolor painting, soft gradients, artistic",
  "cinematic": "cinematic, dramatic lighting, film still, depth of field, 8k"
};

function pollinationsUrl(prompt: string, width: number, height: number, model: string): string {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const encoded = encodeURIComponent(prompt);
  // enhance=true lets the service expand/improve the prompt for better detail;
  // nologo removes the watermark; private keeps results out of the public feed.
  const enhance = model === "flux" ? "&enhance=true" : "";
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true&model=${model}${enhance}`;
}

// Lightly enrich a bare prompt so free models produce sharper, more detailed
// images. Skips enrichment if the user already wrote a rich/long prompt.
function enrichPrompt(prompt: string): string {
  const p = prompt.trim();
  if (p.length > 120) return p; // user gave enough detail already
  return `${p}, highly detailed, sharp focus, high quality, 4k, professional lighting`;
}

async function openAIImage(prompt: string, size: string): Promise<{ url?: string; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return {};
  try {
    const client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 1 });
    const model = process.env.AI_IMAGE_MODEL_OPENAI?.trim() || "gpt-image-1";
    // dall-e-3 only supports 1024x1024 (and 1792x1024 / 1024x1792). Smaller
    // sizes like 512/768 are rejected, so force 1024 for it. gpt-image-1 and
    // dall-e-2 accept the smaller squares.
    const isDalle3 = /dall-e-3/i.test(model);
    const px = isDalle3 ? "1024x1024" : size === "512" ? "512x512" : size === "768" ? "768x768" : "1024x1024";
    // dall-e-3 uses quality "standard" | "hd"; gpt-image-1 uses "high"/"low".
    const quality = isDalle3 ? "hd" : "high";
    const res = await client.images.generate({ model, prompt, size: px as never, n: 1, quality: quality as never });
    const b64 = res.data?.[0]?.b64_json;
    if (b64) return { url: `data:image/png;base64,${b64}` };
    const url = res.data?.[0]?.url;
    if (url) { const d = await fetchToDataUrl(url); return d ? { url: d } : { error: "OpenAI returned an image URL that could not be downloaded." }; }
    return { error: "OpenAI returned no image data." };
  } catch (e) {
    // Surface the real reason (bad/expired key, model not accessible on this
    // account, org not verified for gpt-image-1, billing, etc.) instead of
    // silently falling back and showing a misleading "service busy" message.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[image] OpenAI image generation failed:", msg);
    return { error: `OpenAI: ${msg}` };
  }
}

// Download an image URL and return it as a data: URL (base64). Returns null on
// failure. Uses an AbortController timeout so a slow/hanging upstream request
// never blocks the whole endpoint.
async function fetchToDataUrl(url: string, timeoutMs = 45_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "YnAiUdan/1.0", Accept: "image/*" },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Pollinations' "free limit reached" / error placeholder is a small image.
    // A real generated picture is typically much larger. Treat tiny payloads as
    // the rate-limit placeholder so we can surface a clean error instead.
    if (buf.byteLength < 10_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function registerImageGenRoutes(app: FastifyInstance): Promise<void> {
  // ---- AI-based intent + prompt builder --------------------------------
  // Instead of brittle keyword/regex matching in the UI, we ask the configured
  // AI model (Gemini/Groq/OpenAI) to decide whether the user's message is an
  // image-generation request and, if so, to rewrite it into a clean, detailed
  // ENGLISH image prompt. This works for Hindi, Hinglish, typos, any phrasing
  // ("rose ka photo bano", "mujhe ek sher chahiye drawing", etc.) without any
  // word lists to maintain.
  const intentSchema = z.object({ message: z.string().trim().min(1).max(4000), model: z.string().trim().min(1).max(100).optional() });
  app.post("/api/v1/image/intent", { preHandler: authenticate }, async (request, reply) => {
    const { message, model } = intentSchema.parse(request.body);
    const system = [
      "You decide whether a user's chat message is a request to GENERATE or DRAW an image/picture/photo/art/logo/wallpaper.",
      "The message may be in English, Hindi, or Hinglish (Hindi written in English letters), and may contain typos.",
      "Examples that ARE image requests: 'rose ka photo bano', 'ek sher banao', 'draw a cat', 'make a logo', 'sunset ki tasveer', 'mujhe mountain wallpaper chahiye'.",
      "Examples that are NOT: 'hello', 'what is photosynthesis', 'explain this code', 'tell me about photography'.",
      "If it IS an image request, rewrite the SUBJECT into a vivid, detailed ENGLISH image prompt (describe the object/scene, style, lighting). Keep it under 60 words. Do NOT invent people when a plain object/flower/animal is asked (e.g. 'rose' means the FLOWER, not a person named Rose).",
      "Also infer the best output shape and style from the user's intent (in any language):",
      "- aspect: 'square' (default), 'landscape' (scenery, wallpapers, banners, wide shots), or 'portrait' (posters, phone wallpapers, full-body, tall shots).",
      "- style: one of 'photo','digital-art','anime','3d','logo','sketch','watercolor','cinematic', or '' (empty) if no particular style is implied. Infer from meaning, not keywords (e.g. a company logo -> 'logo', a movie-like scene -> 'cinematic', a cartoon -> 'anime').",
      'Reply with ONLY strict JSON, no markdown: {"image": true|false, "prompt": "<english prompt or empty>", "aspect": "square|landscape|portrait", "style": "<one of the above or empty>"}'
    ].join("\n");
    try {
      const result = await executeModel({
        task: "chat",
        requestedModel: model,
        messages: [ { role: "system", content: system }, { role: "user", content: message } ],
        limits: { maxTokens: 300 }
      });
      let raw = (result.content || "").trim();
      // strip code fences if the model added them
      raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const firstBrace = raw.indexOf("{"); const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) raw = raw.slice(firstBrace, lastBrace + 1);
      let parsed: { image?: boolean; prompt?: string; aspect?: string; style?: string } = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      const isImage = parsed.image === true && typeof parsed.prompt === "string" && parsed.prompt.trim().length > 0;
      if (!isImage) return reply.send({ image: false, prompt: "" });
      // AI-decided shape + style. Validate against known values; anything
      // unexpected falls back to safe defaults so the client stays simple.
      const aspect = ["square", "landscape", "portrait"].includes(parsed.aspect || "") ? parsed.aspect : "square";
      const allowedStyles = ["photo", "digital-art", "anime", "3d", "logo", "sketch", "watercolor", "cinematic"];
      const style = allowedStyles.includes(parsed.style || "") ? parsed.style : "";
      return reply.send({ image: true, prompt: parsed.prompt!.trim(), aspect, style });
    } catch {
      // With the multi-provider fallback in executeModel a real AI should
      // always answer; if all failed, treat as not-an-image so chat still works.
      return reply.send({ image: false, prompt: "" });
    }
  });


  app.post("/api/v1/image/generate", { preHandler: authenticate }, async (request, reply) => {
    const input = schema.parse(request.body);
    const base = Number(input.size ?? "1024");
    const width = input.width ?? base;
    const height = input.height ?? base;
    const styled = input.style && STYLE_SUFFIX[input.style] ? `${input.prompt}, ${STYLE_SUFFIX[input.style]}` : input.prompt;
    const prompt = enrichPrompt(styled);
    const sizeStr = String(base) as "512" | "768" | "1024";

    // 1) OpenAI first (highest quality, no public rate limit).
    const openai = await openAIImage(prompt, sizeStr);
    if (openai.url) return reply.send({ url: openai.url, provider: "openai" });

    // 2) Key-less Pollinations. Try flux (best quality) first, then fall back
    //    to turbo (much faster, far less likely to time out or be throttled).
    //    Each model gets a couple of attempts with a fresh seed.
    const models = ["flux", "turbo"];
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const dataUrl = await fetchToDataUrl(pollinationsUrl(prompt, width, height, model));
        if (dataUrl) return reply.send({ url: dataUrl, provider: `pollinations:${model}` });
        // brief wait before retrying (the free tier allows ~1 image / 45s)
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    // Both providers failed. If OpenAI reported a concrete error, show THAT —
    // it is the actionable reason (bad/expired key, model not accessible,
    // org not verified for gpt-image-1, billing). Only use the generic
    // "free tier busy" message when OpenAI was not configured at all.
    if (openai.error) {
      return reply.code(502).send({ error: `Image generation failed. ${openai.error}. (The free fallback service was also busy.)` });
    }
    return reply.code(429).send({
      error: "Image service is busy right now (the free tier allows ~1 image every 45 seconds). Please wait a few seconds and try again, or set OPENAI_API_KEY for unlimited, higher-quality images."
    });
  });
}
