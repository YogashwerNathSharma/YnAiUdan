import test from "node:test";
import assert from "node:assert/strict";
import { canRunTool, normalizeAutonomyMode, requiresApproval } from "./permissions.js";
import { toolRegistry } from "./tools.js";

test("autonomy aliases normalize to Prisma enum values", () => {
  assert.equal(normalizeAutonomyMode("CONFIRM_TOOLS"), "ASK_BEFORE_TOOLS");
  assert.equal(normalizeAutonomyMode("SAFE_AUTO"), "AUTO_SAFE");
  assert.equal(normalizeAutonomyMode("SUGGEST"), "SUGGEST_ACTIONS");
});

test("low-risk tools remain executable in approval and safe modes", () => {
  assert.equal(canRunTool("USER", "system.echo", "ASK_BEFORE_TOOLS"), true);
  assert.equal(canRunTool("USER", "system.echo", "AUTO_SAFE"), true);
});

test("restricted tools require approval before execution", () => {
  toolRegistry.register({
    name: "test.medium-risk",
    description: "test",
    inputSchema: (await import("zod")).z.object({}),
    risk: "MEDIUM",
    permissions: ["FILE_WRITE"],
    timeoutMs: 1000,
    execute: async () => ({ ok: true })
  });
  assert.equal(canRunTool("DEVELOPER", "test.medium-risk", "ASK_BEFORE_TOOLS"), false);
  assert.equal(canRunTool("DEVELOPER", "test.medium-risk", "ASK_BEFORE_TOOLS", true), true);
  assert.equal(requiresApproval("MEDIUM", "ASK_BEFORE_TOOLS"), true);
});
