// Checkpoint store tests: incremental atomic writes and completed-call lookup
// for resume without repeating paid calls.

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

function tempCheckpointPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-checkpoint-"));
  tempDirs.push(dir);
  return path.join(dir, "checkpoint.json");
}

describe("CheckpointStore", () => {
  it("records completed calls and reloads them after a restart", () => {
    const checkpointPath = tempCheckpointPath();
    const first = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    first.recordCall("1::negation::off", { mode: "off", ok: true });
    expect(first.completed("1::negation::off")).toBe(true);
    expect(first.completed("1::negation::full")).toBe(false);

    const second = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    expect(second.completed("1::negation::off")).toBe(true);
  });

  it("refuses to resume while another live process owns the checkpoint", () => {
    const checkpointPath = tempCheckpointPath();
    const now = Date.now();
    const owner = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-1",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: now },
      nowImpl: () => now,
      staleAfterMs: 300000,
      isProcessAlive: () => true,
    });
    owner.recordCall("1::negation::off", { mode: "off", ok: true });

    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-1",
        owner: { hostname: os.hostname(), pid: process.pid + 1, heartbeatAtMs: now },
        nowImpl: () => now,
        staleAfterMs: 300000,
        isProcessAlive: () => true,
      }),
    ).toThrow(/owned by live process/);
  });
});
