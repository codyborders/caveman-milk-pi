// Heartbeat refresh must ride the same persisted write as every paid-attempt
// reservation, so a resumed remote peer always sees a fresh heartbeat from a
// run that is still spending.

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

describe("heartbeat refresh on attempt reservation", () => {
  it("refreshes the owner heartbeat in the same write that reserves an attempt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-heartbeat-reserve-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    let clock = 1000;
    const nowImpl = () => clock;
    const store = evaluate.openCheckpoint({
      path: checkpointPath,
      runId: "run-hb",
      owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: nowImpl() },
      nowImpl,
    });
    const before = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(before.owner.heartbeatAtMs).toBe(1000);

    clock = 5000;
    store.recordAttempt("provider");
    clock = 9000;
    store.recordAttempt("judge");
    clock = 12000;
    store.recordAttempt("countEndpoint");

    const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(persisted.attemptReservations).toEqual({
      provider: 1,
      judge: 1,
      countEndpoint: 1,
    });
    // The last reservation carried the heartbeat in its persisted write.
    expect(persisted.owner.heartbeatAtMs).toBe(12000);
  });
});
