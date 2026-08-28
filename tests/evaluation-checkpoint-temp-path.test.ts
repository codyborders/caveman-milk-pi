// Unique atomic temp paths: a crashed writer can leave temp artifacts
// behind. A later writer must never reuse the same temporary path, because a
// leftover artifact at that path would corrupt or block the next persist.
// Public boundary: openCheckpoint(...).recordCall(...) must survive foreign
// residue. The initial failure was EISDIR against the shared temp name.

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

describe("checkpoint temp path uniqueness", () => {
  it("keeps persisting when a stale artifact occupies the legacy temp path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-tmp-unique-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    const runId = "run-tmp";
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId,
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
    });

    // Simulate residue from a crashed writer: the shared deterministic temp
    // path now exists as a directory, so reusing it fails with EISDIR.
    // Unique per-write temp paths are the only safe fix.
    const legacyTempPath = path.join(dir, `.${path.basename(checkpointPath)}.${runId}.tmp`);
    fs.mkdirSync(legacyTempPath);

    expect(() => store.recordCall("k1", { ok: true })).not.toThrow();

    const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(persisted.completedCalls.k1).toEqual({ ok: true });
    // The foreign artifact is not the runner's to delete.
    expect(fs.existsSync(legacyTempPath)).toBe(true);
  });

  it("leaves no temporary residue of its own across repeated persists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-tmp-residue-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-residue",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
    });
    for (let index = 0; index < 5; index += 1) {
      store.recordCall(`k${index}`, { index });
    }
    const residue = fs.readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(residue).toEqual([]);
    expect(store.completed("k4")).toBe(true);
  });
});
