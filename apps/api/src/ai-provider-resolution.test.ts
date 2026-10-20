import test from "node:test";
import assert from "node:assert/strict";
import { resolveProvider } from "./ai.js";

test("explicit mock provider remains available for development fallback", () => {
  assert.equal(resolveProvider("mock:default").name, "mock");
});

test("unknown provider fails clearly instead of silently using mock", () => {
  assert.throws(
    () => resolveProvider("missing-provider:some-model"),
    /AI provider 'missing-provider' is not registered/,
  );
});
