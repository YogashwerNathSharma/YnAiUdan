import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexRepositoryForTask } from "./github-tree-index.js";

describe("github tree index", () => {
  it("selects source files from a repository tree", async () => {
    const client = { listTree: async () => [
      { path: "src/login.ts", type: "file", content: "login authentication" },
      { path: "src/auth.ts", type: "file", content: "authentication" },
      { path: "README.md", type: "file", content: "login" }
    ] } as any;
    const result = await indexRepositoryForTask(client, { owner: "o", name: "r" }, "abcdef1", "fix login", 5);
    assert.deepEqual(result.paths, ["src/login.ts", "src/auth.ts"]);
  });
});
