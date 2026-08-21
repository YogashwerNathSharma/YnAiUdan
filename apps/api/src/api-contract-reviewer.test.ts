import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewApiContracts } from "./api-contract-reviewer.js";

describe("API contract reviewer", () => {
  it("flags unvalidated request bodies", () => {
    const result = reviewApiContracts([{ path: "src/routes/users.ts", content: "const body = req.body; return reply.send(body);" }]);
    assert.ok(result.findings.some(f => f.rule === "UNVALIDATED_BODY"));
  });

  it("does not flag validated route input", () => {
    const result = reviewApiContracts([{ path: "src/routes/users.ts", content: "schema.parse(req.body);" }]);
    assert.equal(result.findings.length, 0);
  });
});
