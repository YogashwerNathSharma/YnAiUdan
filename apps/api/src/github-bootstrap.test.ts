import { describe, expect, it } from "vitest";
import { githubActionPolicy, validateGitRef } from "./github-policy.js";

describe("GitHub safety policy", () => {
  it("allows read actions without approval", () => expect(githubActionPolicy("READ_REPOSITORY")).toEqual({ allowed: true, requiresApproval: false }));
  it("requires approval for write actions", () => expect(githubActionPolicy("PUSH").requiresApproval).toBe(true));
  it("rejects unsafe refs", () => expect(validateGitRef("../main")).toBe(false));
  it("allows normal refs", () => expect(validateGitRef("feature/agent-work")).toBe(true));
});
