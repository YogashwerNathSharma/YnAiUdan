import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMultiAgentOrchestrator } from "./multi-agent-orchestrator.js";

const ok = (agent: "CODER" | "DEBUGGER" | "REVIEWER" | "GITHUB") => async () => ({ agent, status: "SUCCESS" as const, summary: "ok" });

describe("multi-agent orchestrator", () => {
  it("routes a coding task through coder, reviewer and github", async () => {
    const result = await runMultiAgentOrchestrator({ task: "add a feature", tenantId: "t", userId: "u", role: "DEVELOPER" }, { CODER: ok("CODER"), REVIEWER: ok("REVIEWER"), GITHUB: ok("GITHUB") });
    assert.deepEqual(result.route, ["CODER", "REVIEWER", "GITHUB"]);
    assert.equal(result.status, "SUCCESS");
  });

  it("routes a bug through debugger first", async () => {
    const result = await runMultiAgentOrchestrator({ task: "fix this runtime bug", tenantId: "t", userId: "u", role: "DEVELOPER" }, { DEBUGGER: ok("DEBUGGER"), REVIEWER: ok("REVIEWER"), GITHUB: ok("GITHUB") });
    assert.deepEqual(result.route, ["DEBUGGER", "REVIEWER", "GITHUB"]);
  });

  it("stops safely when an agent fails", async () => {
    const result = await runMultiAgentOrchestrator({ task: "add a feature", tenantId: "t", userId: "u", role: "DEVELOPER" }, { CODER: async () => ({ agent: "CODER", status: "FAILED", summary: "failed" }), REVIEWER: ok("REVIEWER"), GITHUB: ok("GITHUB") });
    assert.equal(result.status, "FAILED");
    assert.equal(result.history.length, 1);
  });
});
