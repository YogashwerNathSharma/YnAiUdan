import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verificationPassed } from "./code-verification.js";

describe("code verification", () => {
  it("passes only when every verification command succeeds", () => {
    assert.equal(verificationPassed([{ ok: true, command: "pnpm test", exitCode: 0 }]), true);
    assert.equal(verificationPassed([{ ok: true, command: "pnpm test", exitCode: 0 }, { ok: false, command: "pnpm build", exitCode: 1 }]), false);
  });

  it("does not consider an empty verification run successful", () => {
    assert.equal(verificationPassed([]), false);
  });
});
