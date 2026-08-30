// Checkpoint ownership rule: a same-host live pid blocks resume regardless
// of heartbeat age. Liveness, not heartbeat freshness, decides same-host.

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

function tempCheckpointPath(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return path.join(dir, "checkpoint.json");
}

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

describe("checkpoint ownership", () => {
  it("blocks a same-host live pid regardless of heartbeat age", () => {
    const checkpointPath = tempCheckpointPath("caveman-owner-live-stale-");
    seedCheckpoint(checkpointPath, {
      hostname: os.hostname(),
      pid: 424242,
      heartbeatAtMs: Date.now() - 3600_000,
    });
    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-owner",
        owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
        isProcessAlive: () => true,
      }),
    ).toThrow(/owned by live process/);
  });
});
