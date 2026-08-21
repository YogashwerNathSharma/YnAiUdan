import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRelevantChunks } from "./context-engine-chunks.js";

describe("context engine chunks", () => {
  it("adds ranked code chunks without changing the selected files", () => {
    const context = {
      reference: { tenantId: "t", userId: "u", repository: { owner: "o", name: "r" }, commitSha: "abcdef1" },
      selectedPaths: ["src/auth.ts"],
      files: [{ path: "src/auth.ts", content: "function login() { return true; }\nfunction logout() { return false; }" }],
      graph: [],
      ranking: []
    } as any;
    const result = addRelevantChunks(context, "login", 1);
    assert.deepEqual(result.selectedPaths, context.selectedPaths);
    assert.equal(result.chunks.length, 1);
    assert.match(result.chunks[0].text, /login/);
  });
});
