import { strict as assert } from "node:assert";
import test from "node:test";
import { canRunTool } from "./permissions.js";
import { toolRegistry } from "./tools.js";

test("low-risk tools still require declared permissions", () => {
  assert.equal(canRunTool("USER", "system.echo", "SAFE_AUTO"), true);
  assert.equal(canRunTool("AGENT", "workspace.write", "AUTONOMOUS"), false);
});

test("tool registry exposes risk and permission metadata", () => {
  const echo = toolRegistry.get("system.echo");
  assert.ok(echo);
  assert.equal(echo.risk, "LOW");
  assert.deepEqual(echo.permissions, []);
});
