// Dead same-host owner takeover: a checkpoint whose recorded owner PID is
// dead on the same host may be resumed by a fresh runner.

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

function seedCheckpoint(checkpointPath, owner) {
  fs.writeFileSync(
    checkpointPath,
    JSON.stringify(
      {
        runId: "run-owner",
        completedCalls: {},
        runOrder: [],
        failures: [],
        attemptReservations: { provider: 0, judge: 0, countEndpoint: 0 },
        countResults: {},
        owner,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

describe("dead same-host owner takeover", () => {
  it("allows takeover when the recorded same-host PID is dead", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-dead-owner-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    const deadPid = 99999; // This PID almost certainly does not exist
    seedCheckpoint(checkpointPath, {
      hostname: os.hostname(),
      pid: deadPid,
      heartbeatAtMs: Date.now() - 3600_000,
    });

    // Opening the checkpoint with a fresh owner must succeed (no throw)
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-owner",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
      isProcessAlive: (pid) => {
        // Simulate a dead process for the recorded PID
        if (pid === deadPid) return false;
        return true;
      },
    });

    expect(store.state.owner.hostname).toBe(os.hostname());
    expect(store.state.owner.pid).toBe(process.pid);
    expect(store.completed("some-key")).toBe(false);
  });

  it("still blocks when the same-host PID is alive", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-dead-owner-live-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    seedCheckpoint(checkpointPath, {
      hostname: os.hostname(),
      pid: process.pid,
      heartbeatAtMs: Date.now() - 3600_000,
    });

    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-owner",
        owner: { hostname: os.hostname(), pid: process.pid + 1, heartbeatAtMs: Date.now() },
        isProcessAlive: () => true,
      }),
    ).toThrow(/owned by live process/);
  });
});
