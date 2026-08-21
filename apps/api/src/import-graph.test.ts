import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImportGraph, expandImportContext } from "./import-graph.js";

describe("import graph", () => {
  it("builds imports and reverse dependents", () => {
    const graph = buildImportGraph([
      { path: "src/login.ts", content: "import { auth } from './auth';" },
      { path: "src/auth.ts", content: "export const auth = true;" },
      { path: "src/login.test.ts", content: "import './login';" }
    ]);
    const login = graph.find(node => node.path === "src/login.ts")!;
    assert.deepEqual(login.imports, ["src/auth.ts"]);
    assert.deepEqual(graph.find(node => node.path === "src/auth.ts")!.dependents, ["src/login.ts"]);
  });

  it("expands context in both dependency directions with a bound", () => {
    const graph = buildImportGraph([
      { path: "src/login.ts", content: "import './auth';" },
      { path: "src/auth.ts", content: "import './user';" },
      { path: "src/user.ts", content: "" },
      { path: "src/other.ts", content: "" }
    ]);
    assert.deepEqual(expandImportContext(graph, ["src/login.ts"], 3), ["src/login.ts", "src/auth.ts", "src/user.ts"]);
  });
});
