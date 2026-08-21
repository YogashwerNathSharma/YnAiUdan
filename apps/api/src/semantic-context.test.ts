import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { semanticRank } from "./semantic-context.js";

describe("semantic context", () => {
  it("uses deterministic lexical ranking without a provider", async () => {
    const result = await semanticRank("authentication login", [
      { path: "src/auth.ts", text: "authentication service" },
      { path: "src/report.ts", text: "sales report" }
    ]);
    assert.equal(result[0].path, "src/auth.ts");
    assert.ok(result[0].score > result[1].score);
  });

  it("supports embedding-provider cosine ranking", async () => {
    const vectors: Record<string, number[]> = { query: [1, 0], auth: [1, 0], report: [0, 1] };
    const result = await semanticRank("query", [{ path: "auth.ts", text: "auth" }, { path: "report.ts", text: "report" }], { embed: async text => vectors[text] ?? [0, 0] });
    assert.equal(result[0].path, "auth.ts");
  });
});
