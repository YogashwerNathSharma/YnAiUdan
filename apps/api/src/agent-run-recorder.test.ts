import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentRunRecorder } from "./agent-run-recorder.js";
import { createAgentRun, InMemoryAgentRunStore } from "./agent-run-state.js";

describe("agent run recorder", () => {
  it("records start, completion and failure events", async () => {
    const store = new InMemoryAgentRunStore();
    await store.create(createAgentRun({ id: "r", tenantId: "t", userId: "u", task: "x" }));
    const recorder = new AgentRunRecorder(store);
    await recorder.started("r", "t", "CODER");
    await recorder.completed("r", "t", { agent: "CODER", status: "SUCCESS", summary: "done" });
    await recorder.failed("r", "t", new Error("boom"));
    const run = await store.get("r", "t");
    assert.deepEqual(run?.events.map(e => e.type), ["RUN_STARTED", "CODER_STARTED", "CODER_COMPLETED", "RUN_ERROR"]);
  });
});
