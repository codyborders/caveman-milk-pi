// Atomic ownership claim: the checkpoint-sidecar claim is the takeover
// mutex. A claim held by a live same-host pid must block resume even when
// the recorded checkpoint owner looks dead.

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

describe("checkpoint claim ownership", () => {
  it("blocks takeover when a live foreign pid holds the claim", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-claim-live-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          runId: "run-claim",
          completedCalls: {},
          runOrder: [],
          failures: [],
          attemptReservations: { provider: 0, judge: 0, countEndpoint: 0 },
          countResults: {},
          owner: { hostname: os.hostname(), pid: 999999, heartbeatAtMs: Date.now() - 3600_000 },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      `${checkpointPath}.claim`,
      JSON.stringify({ hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() }),
      "utf8",
    );

    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-claim",
        owner: { hostname: os.hostname(), pid: process.pid + 1, heartbeatAtMs: Date.now() },
        isProcessAlive: (pid) => pid === process.pid,
      }),
    ).toThrow(/owned by live process/);
  });

  it("blocks takeover when a fresh remote owner holds the claim", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-claim-remote-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          runId: "run-claim",
          completedCalls: {},
          runOrder: [],
          failures: [],
          attemptReservations: { provider: 0, judge: 0, countEndpoint: 0 },
          countResults: {},
          owner: { hostname: os.hostname(), pid: 999999, heartbeatAtMs: Date.now() - 3600_000 },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      `${checkpointPath}.claim`,
      JSON.stringify({ hostname: "other-host", pid: 424242, heartbeatAtMs: Date.now() }),
      "utf8",
    );

    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-claim",
        owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
        isProcessAlive: () => false,
      }),
    ).toThrow(/remote/);
  });

  it("keeps a remote claim when the checkpoint heartbeat is fresher", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-claim-refreshed-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    const remoteOwner = {
      hostname: "other-host",
      pid: 424242,
      heartbeatAtMs: Date.now(),
    };
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          runId: "run-claim",
          completedCalls: {},
          runOrder: [],
          failures: [],
          attemptReservations: { provider: 1, judge: 0, countEndpoint: 0 },
          countResults: {},
          owner: remoteOwner,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      `${checkpointPath}.claim`,
      JSON.stringify({ ...remoteOwner, heartbeatAtMs: Date.now() - 3600_000 }),
      "utf8",
    );

    expect(() =>
      evaluate.openCheckpoint({
        path: checkpointPath,
        runId: "run-claim",
        owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
        isProcessAlive: () => false,
      }),
    ).toThrow(/remote/);

    expect(JSON.parse(fs.readFileSync(`${checkpointPath}.claim`, "utf8"))).toEqual({
      ...remoteOwner,
      heartbeatAtMs: expect.any(Number),
    });
  });

  it("steals a stale claim from a dead same-host holder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-claim-stale-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          runId: "run-claim",
          completedCalls: {},
          runOrder: [],
          failures: [],
          attemptReservations: { provider: 0, judge: 0, countEndpoint: 0 },
          countResults: {},
          owner: { hostname: os.hostname(), pid: 999999, heartbeatAtMs: Date.now() - 3600_000 },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      `${checkpointPath}.claim`,
      JSON.stringify({
        hostname: os.hostname(),
        pid: 999999,
        heartbeatAtMs: Date.now() - 3600_000,
      }),
      "utf8",
    );

    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-claim",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
      isProcessAlive: () => false,
    });
    store.recordCall("k1", { ok: true });
    const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(persisted.owner.pid).toBe(process.pid);
    expect(persisted.completedCalls.k1).toEqual({ ok: true });
  });

  it("fails closed when a dispossessed owner persists again", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-claim-lost-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-claim",
      owner: { hostname: "old-host", pid: process.pid, heartbeatAtMs: Date.now() - 3600_000 },
    });
    store.recordCall("k0", { ok: true });

    // Another host takes over while the original owner is still open: the
    // claim is rewritten and the checkpoint owner changes underneath.
    const taker = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-claim",
      owner: { hostname: os.hostname(), pid: process.pid + 1, heartbeatAtMs: Date.now() },
      nowImpl: () => Date.now(),
      isProcessAlive: () => false,
    });
    expect(taker.state.owner.pid).toBe(process.pid + 1);

    expect(() => store.recordCall("k1", { ok: true })).toThrow(/taken over|dispossessed/i);
  });
});
