import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpLlmProvider } from "./llm-provider.js";

describe("LLM provider", () => {
  it("rejects malformed provider responses", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ model: "test" }), { status: 200 })) as typeof fetch;
    try { await assert.rejects(() => new HttpLlmProvider("https://example.invalid").generate({ messages: [{ role: "user", content: "hello" }] }), /invalid response/); }
    finally { globalThis.fetch = original; }
  });

  it("returns normalized provider output", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ text: "ok", model: "test", usage: { inputTokens: 1, outputTokens: 1 } }), { status: 200 })) as typeof fetch;
    try { const result = await new HttpLlmProvider("https://example.invalid", "key").generate({ messages: [{ role: "user", content: "hello" }] }); assert.equal(result.text, "ok"); assert.equal(result.model, "test"); }
    finally { globalThis.fetch = original; }
  });
});
