import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentRun, InMemoryAgentRunStore } from "./agent-run-state.js";

describe("agent run state", () => {
  it("persists events and isolates tenants", async () => {
    const store = new InMemoryAgentRunStore();
    await store.create(createAgentRun({ id: "run-1", tenantId: "tenant-a", userId: "user-a", task: "build feature" }));
    await store.append("run-1", "tenant-a", { at: new Date().toISOString(), type: "CODER_COMPLETED", agent: "CODER", status: "SUCCESS" });
    const run = await store.get("run-1", "tenant-a");
    assert.equal(run?.events.length, 2);
    assert.equal(await store.get("run-1", "tenant-b"), null);
  });

  it("tracks terminal status", async () => {
    const store = new InMemoryAgentRunStore();
    await store.create(createAgentRun({ id: "run-2", tenantId: "tenant-a", userId: "user-a", task: "fix bug" }));
    const updated = await store.updateStatus("run-2", "tenant-a", "SUCCESS");
    assert.equal(updated.status, "SUCCESS");
  });
});
