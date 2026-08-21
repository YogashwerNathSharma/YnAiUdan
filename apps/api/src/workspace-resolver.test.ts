import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWorkspace } from "./workspace-resolver.js";

describe("workspace resolver", () => {
  it("loads only the requested files from an immutable commit", async () => {
    const calls: string[] = [];
    const workspace = await resolveWorkspace({ tenantId: "t", userId: "u", repository: { owner: "o", name: "r" }, commitSha: "abcdef1234567890" }, ["src/a.ts", "src/a.ts", "src/b.ts"], {
      getFile: async (_repo, path, ref) => { calls.push(`${path}@${ref}`); return { content: path }; }
    });
    assert.deepEqual(calls, ["src/a.ts@abcdef1234567890", "src/b.ts@abcdef1234567890"]);
    assert.deepEqual(workspace.files.map(f => f.path), ["src/a.ts", "src/b.ts"]);
    assert.equal(workspace.baseRef, "abcdef1234567890");
  });

  it("rejects traversal and oversized selections", async () => {
    const loader = { getFile: async () => ({ content: "x" }) };
    await assert.rejects(() => resolveWorkspace({ tenantId: "t", userId: "u", repository: { owner: "o", name: "r" }, commitSha: "abcdef1" }, ["../secret"], loader), /Invalid workspace file path/);
    await assert.rejects(() => resolveWorkspace({ tenantId: "t", userId: "u", repository: { owner: "o", name: "r" }, commitSha: "abcdef1" }, Array.from({ length: 101 }, (_, i) => `src/${i}.ts`), loader), /too large/);
  });
});
