import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateStructuredCode } from "./code-generation-protocol.js";

describe("structured code generation", () => {
  it("parses a valid structured response", async () => {
    const result = await generateStructuredCode({ generate: async () => ({ model: "test", text: JSON.stringify({ summary: "add feature", plan: ["edit file"], patches: [{ path: "src/a.ts", content: "export const a = 1;", status: "modified" }] }) }) }, { task: "add feature", files: [{ path: "src/a.ts", content: "old" }] });
    assert.equal(result.summary, "add feature");
    assert.equal(result.patches[0].path, "src/a.ts");
  });

  it("rejects malformed or unsafe output", async () => {
    await assert.rejects(() => generateStructuredCode({ generate: async () => ({ text: "not json" }) }, { task: "bad", files: [] }), /non-JSON/);
    await assert.rejects(() => generateStructuredCode({ generate: async () => ({ text: JSON.stringify({ summary: "bad", plan: ["x"], patches: [{ path: "../secret", content: "x" }] }) }) }, { task: "bad", files: [] }), /Unsafe generated path/);
  });
});
