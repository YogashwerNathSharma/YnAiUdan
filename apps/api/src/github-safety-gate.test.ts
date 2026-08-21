import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGitHubMutation } from "./github-safety-gate.js";

const base = { role: "DEVELOPER", tenantId: "tenant-1", repository: { owner: "YogashwerNathSharma", name: "YnAiUdan" }, allowedRepositories: ["YogashwerNathSharma/YnAiUdan"], sourceBranch: "main", workingBranch: "ai/fix", baseBranch: "main", operation: "PR" as const, explicitApproval: true };

describe("GitHub safety gate", () => {
  it("allows an approved PR from an isolated branch", () => assert.equal(evaluateGitHubMutation(base).allowed, true));
  it("blocks direct protected-branch mutation", () => assert.equal(evaluateGitHubMutation({ ...base, operation: "COMMIT", workingBranch: "main" }).allowed, false));
  it("blocks non-allowlisted repositories", () => assert.equal(evaluateGitHubMutation({ ...base, repository: { owner: "other", name: "repo" } }).allowed, false));
  it("requires explicit approval", () => assert.equal(evaluateGitHubMutation({ ...base, explicitApproval: false }).allowed, false));
});
