import { describe, expect, it } from "vitest";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

describe("GitHub write policy", () => {
  it("requires approval for pushes and merges", () => {
    expect(requiresApproval("PUSH", "feature/test")).toBe(true);
    expect(requiresApproval("MERGE", "feature/test")).toBe(true);
  });
  it("rejects protected branches", () => {
    expect(() => validateBranchName("main")).toThrow();
    expect(() => validateBranchName("feature/agent-work")).not.toThrow();
  });
});
