// True two-process resume regression (authorized green-only checkpoint
// regression test): two real child processes race one checkpoint with a
// dead recorded owner. The staggered start makes the second child face a
// holder that already claimed and persisted, so this test cannot produce an
// initial failure; it pins the end-to-end guarantee that exactly one real
// process resumes. The claim-mutex window itself is covered red-first in
// evaluation-checkpoint-claim.test.ts (live claim blocks, fresh remote
// claim blocks, stale claim is stolen, dispossessed owner fails closed).

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const evaluatePath = path.resolve(here, "..", "scripts", "evaluate.mjs");

const childSource = `
import * as fs from "node:fs";
import * as os from "node:os";
import * as evaluate from ${JSON.stringify(evaluatePath)};

const [, checkpointPath, runId, resultPath, holdMs] = process.argv;
const block = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
};
try {
  const store = evaluate.openCheckpoint({
    path: checkpointPath,
    runId,
    owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: Date.now() },
  });
  store.recordAttempt("provider");
  store.recordCall("child-call", { pid: process.pid });
  block(holdMs);
  fs.writeFileSync(resultPath, JSON.stringify({ ok: true, pid: process.pid }));
} catch (error) {
  fs.writeFileSync(
    resultPath,
    JSON.stringify({ ok: false, pid: process.pid, error: String(error.message ?? error) }),
  );
}
`;

function findDeadPid() {
  for (let candidate = 300000; candidate < 300100; candidate += 1) {
    try {
      process.kill(candidate, 0);
    } catch {
      return candidate;
    }
  }
  throw new Error("no dead pid candidate found");
}

function runChild(checkpointPath, runId, resultPath, holdMs) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      childSource,
      "--",
      checkpointPath,
      runId,
      resultPath,
      String(holdMs),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve) => {
    child.on("close", () => {
      if (!fs.existsSync(resultPath)) {
        resolve({ ok: false, pid: null, error: stderr });
        return;
      }
      resolve(JSON.parse(fs.readFileSync(resultPath, "utf8")));
    });
  });
}

describe("two-process checkpoint resume", () => {
  it("lets exactly one of two concurrent real processes resume", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-two-process-"));
    tempDirs.push(dir);
    const checkpointPath = path.join(dir, "checkpoint.json");
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          runId: "run-race",
          completedCalls: {},
          runOrder: [],
          failures: [],
          attemptReservations: { provider: 0, judge: 0, countEndpoint: 0 },
          countResults: {},
          owner: {
            hostname: os.hostname(),
            pid: findDeadPid(),
            heartbeatAtMs: Date.now() - 3600_000,
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const resultA = path.join(dir, "result-a.json");
    const resultB = path.join(dir, "result-b.json");
    // Child A holds the claimed checkpoint for 1200 ms after resuming, so
    // child B genuinely races a live holder that has already persisted.
    const [a, b] = await Promise.all([
      runChild(checkpointPath, "run-race", resultA, 1200),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(runChild(checkpointPath, "run-race", resultB, 0));
        }, 150);
      }),
    ]);

    const outcomes = [a, b];
    const winners = outcomes.filter((outcome) => outcome.ok);
    const losers = outcomes.filter((outcome) => !outcome.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0].error).toMatch(/owned by live process|remote/);

    const persisted = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(persisted.attemptReservations.provider).toBe(1);
    expect(persisted.completedCalls["child-call"].pid).toBe(winners[0].pid);
  });
});
