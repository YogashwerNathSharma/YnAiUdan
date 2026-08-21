import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContextPackage } from "./context-engine.js";

describe("context engine", () => {
  it("returns ranked plus dependency-aware files from an immutable ref", async () => {
    const client = {
      listTree: async () => [
        { path: "src/login.ts", type: "file", content: "import './auth'; login" },
        { path: "src/auth.ts", type: "file", content: "authentication" },
        { path: "src/report.ts", type: "file", content: "sales report" }
      ],
      getFile: async (_repo: unknown, path: string, _ref: string) => ({ content: path === "src/login.ts" ? "import './auth'; login" : path === "src/auth.ts" ? "authentication" : "sales report" })
    } as any;
    const result = await buildContextPackage({ client, repository: { owner: "o", name: "r" }, ref: "abcdef1", task: "fix login", tenantId: "t", userId: "u" });
    assert.deepEqual(result.selectedPaths, ["src/login.ts", "src/auth.ts"]);
    assert.equal(result.reference.commitSha, "abcdef1");
  });
});
