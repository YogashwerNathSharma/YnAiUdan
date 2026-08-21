import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCoderInputFromRepository } from "./context-coder-pipeline.js";

describe("context coder pipeline", () => {
  it("builds bounded repository context before coding", async () => {
    const client = {
      listTree: async () => [
        { path: "src/login.ts", type: "file", content: "export function login() { return true; }" },
        { path: "src/report.ts", type: "file", content: "export function report() { return true; }" }
      ],
      getFile: async (_repo: unknown, path: string, _ref: string) => ({ content: path.includes("login") ? "export function login() { return true; }" : "export function report() { return true; }" })
    } as any;
    const context = await buildCoderInputFromRepository({ client, repository: { owner: "o", name: "r" }, ref: "abcdef1", task: "fix login", tenantId: "t", userId: "u", maxFiles: 1, maxChunks: 1 });
    assert.equal(context.selectedPaths.length, 1);
    assert.equal(context.chunks.length, 1);
    assert.equal(context.files[0].path, "src/login.ts");
  });
});
