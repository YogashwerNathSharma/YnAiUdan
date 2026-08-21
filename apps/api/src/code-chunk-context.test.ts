import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkSourceFile, selectRelevantChunks } from "./code-chunk-context.js";

describe("code chunk context", () => {
  it("extracts bounded function/class chunks", () => {
    const chunks = chunkSourceFile("src/auth.ts", "export function login() {\n  return true;\n}\n\nexport class AuthService {\n  verify() { return true; }\n}");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].startLine, 1);
  });

  it("ranks chunks for the task", () => {
    const chunks = chunkSourceFile("src/auth.ts", "function login() { return true; }\nfunction logout() { return false; }");
    const selected = selectRelevantChunks("login", chunks, 1);
    assert.equal(selected[0].text.includes("login"), true);
  });
});
