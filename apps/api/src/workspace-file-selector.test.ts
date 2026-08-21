import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectRelevantFiles } from "./workspace-file-selector.js";

describe("workspace file selector", () => {
  it("ranks task-relevant paths above unrelated files", () => {
    const result = selectRelevantFiles("fix login authentication", [
      { path: "src/auth/login.ts", content: "authentication login" },
      { path: "src/reports/sales.ts", content: "sales report" },
      { path: "src/auth/token.ts", content: "token authentication" }
    ], 2);
    assert.deepEqual(result.paths, ["src/auth/login.ts", "src/auth/token.ts"]);
  });

  it("bounds the selected file count", () => {
    const result = selectRelevantFiles("student", Array.from({ length: 30 }, (_, i) => ({ path: `src/student${i}.ts`, content: "student" })), 5);
    assert.equal(result.paths.length, 5);
  });
});
