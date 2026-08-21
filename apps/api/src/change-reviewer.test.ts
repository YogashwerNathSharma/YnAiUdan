import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewChanges } from "./change-reviewer.js";

describe("change reviewer", () => {
  it("rejects sensitive and unexpected changes", () => {
    const review = reviewChanges([{ path: ".env", status: "modified", additions: 1, deletions: 1 }, { path: "src/other.ts", status: "modified", additions: 2, deletions: 1 }], ["src/feature.ts"]);
    assert.equal(review.approved, false);
    assert.ok(review.issues.some(issue => issue.includes("Sensitive path")));
    assert.ok(review.issues.some(issue => issue.includes("Unexpected path")));
  });

  it("accepts a small scoped source change", () => {
    const review = reviewChanges([{ path: "src/feature.ts", status: "modified", additions: 20, deletions: 4 }], ["src/feature.ts"]);
    assert.equal(review.approved, true);
    assert.equal(review.score, 100);
  });
});
