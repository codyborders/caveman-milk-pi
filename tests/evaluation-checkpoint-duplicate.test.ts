// Duplicate checkpoint records: re-recording the same key updates the stored
// value without duplicating the run order entry.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("duplicate checkpoint records", () => {
  it("keeps one run-order entry per key when a key is re-recorded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-cp-dup-"));
    tempDirs.push(root);
    const checkpointPath = path.join(root, "checkpoint.json");
    const store = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-x" });
    store.recordCall("k1", { ok: 1 });
    store.recordCall("k1", { ok: 2 });
    store.recordCall("k2", { ok: 3 });
    const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(persisted.completedCalls.k1).toEqual({ ok: 2 });
    expect(persisted.runOrder).toEqual(["k1", "k2"]);
  });
});
