import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankHybridContext } from "./hybrid-context-ranking.js";

describe("hybrid context ranking", () => {
  it("combines lexical, semantic, dependency and test relevance", async () => {
    const result = await rankHybridContext("fix login authentication", [
      { path: "src/login.ts", content: "login authentication import './auth'" },
      { path: "src/auth.ts", content: "authentication" },
      { path: "src/login.test.ts", content: "login test" },
      { path: "src/report.ts", content: "sales report" }
    ]);
    assert.equal(result.length, 4);
    assert.ok(result.find(item => item.path === "src/login.ts")!.score > result.find(item => item.path === "src/report.ts")!.score);
    assert.equal(result.find(item => item.path === "src/login.test.ts")!.test, 1);
  });
});
