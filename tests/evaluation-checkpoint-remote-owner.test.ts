// Checkpoint ownership rule: a fresh remote owner blocks takeover. Liveness
// cannot be probed across hosts, so heartbeat freshness is the only signal.

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

describe("checkpoint remote ownership", () => {
  it("blocks a fresh remote owner", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-owner-remote-fresh-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
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
          owner: { hostname: "other-host", pid: 424242, heartbeatAtMs: Date.now() },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-owner",
        owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
        isProcessAlive: () => true,
      }),
    ).toThrow(/remote/);
  });

  it("allows takeover when the remote heartbeat has expired", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-owner-remote-expired-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
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
          owner: {
            hostname: "other-host",
            pid: 424242,
            heartbeatAtMs: Date.now() - 3600_000,
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-owner",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
      nowImpl: () => Date.now(),
    });
    expect(store.state.owner.hostname).toBe(os.hostname());
    expect(store.state.owner.pid).toBe(process.pid);
  });
});
