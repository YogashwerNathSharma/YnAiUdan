import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("task worker requeues while the task remains RUNNING", async () => {
  const file = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "task-worker.ts"), "utf8");
  assert.match(file, /current\?\.status === ["']RUNNING["']/);
  assert.match(file, /taskQueue\.enqueue\(task\.id\)/);
});
