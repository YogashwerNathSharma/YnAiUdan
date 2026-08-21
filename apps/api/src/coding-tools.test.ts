import assert from "node:assert/strict";
import test from "node:test";
import { registerCodingTools } from "./coding.js";
import { toolRegistry } from "./tools.js";

test("coding tools expose safe read/write primitives", () => {
  registerCodingTools();
  const names = new Set(toolRegistry.list().map(tool => tool.name));
  assert.ok(names.has("workspace.list"));
  assert.ok(names.has("workspace.read"));
  assert.ok(names.has("workspace.search"));
  assert.ok(names.has("workspace.write"));
  assert.equal(toolRegistry.get("workspace.read")?.risk, "LOW");
  assert.equal(toolRegistry.get("workspace.search")?.risk, "LOW");
  assert.equal(toolRegistry.get("workspace.write")?.risk, "MEDIUM");
});
