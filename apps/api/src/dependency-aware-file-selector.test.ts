import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectDependencyAwareFiles } from "./dependency-aware-file-selector.js";

describe("dependency-aware file selector", () => {
  it("adds local imports of relevant files within the bound", () => {
    const result = selectDependencyAwareFiles("fix login", [
      { path: "src/login.ts", content: "", imports: ["./auth"] },
      { path: "src/auth.ts", content: "", imports: [] },
      { path: "src/report.ts", content: "", imports: [] }
    ], 3);
    assert.deepEqual(result.paths, ["src/login.ts", "src/auth.ts"]);
  });
});
