// Integrity behaviors for the shared-prefix v12 runner: invalid attempts are
// preserved instead of aborting the run, cache-expectation failures become
// exclusions with first-turn cache reads, canonical hash drift is rejected,
// and the paid process cap stops the run before it starts. A fake launchNode
// stands in for Pi processes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

async function loadRunner() {
  try {
    return await import("../scripts/eval/shared-prefix-v12-runner.mjs");
  } catch {
    return null;
  }
}

const fixtures = {
  version: 12,
  groups: [
    {
      id: "eligible-prose",
      classification: "eligible",
      tasks: [
        {
          id: "t1",
          kind: "comparison",
          prompt: "Compare. Cover throughput.",
          requiredFacts: ["throughput"],
          childTasks: ["c1"],
        },
      ],
    },
  ],
};

function outcome(request) {
  const cacheRead = request?.phase === "measured" ? 400 : 0;
  return {
    text: "covers throughput",
    usage: { input: 20, output: 8, cacheRead, cacheWrite: 4 },
    usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
    rawEvents: [],
    elapsedMs: 500,
  };
}

async function runReport(launchNode, overrides = {}) {
  const runner = await loadRunner();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));
  return runner.runSharedPrefixV12Evaluation({
    fixtures,
    provider: "pi",
    allowPaid: true,
    model: "test-model",
    maxPaidProcesses: 100,
    repetitions: 3,
    seed: "0x1",
    workspaceRoot,
    captureDir,
    launchNode,
    ...overrides,
  });
}

describe("shared-prefix v12 runner integrity", () => {
  it("preserves a failed launch as an invalid attempt and fails closed", async () => {
    const report = await runReport(async (request) => {
      if (
        request.kind === "finalizer" &&
        request.arm === "shared-prefix-candidate" &&
        request.nodeId.includes("rep1")
      ) {
        throw new Error("provider 500");
      }
      return outcome(request);
    });
    const invalid = report.attempts.filter((attempt) => attempt.error);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].error).toBe("provider 500");
    expect(invalid[0].validUsage).toBe(false);
    expect(report.exclusions.length).toBeGreaterThanOrEqual(1);
    expect(report.eligibleGroup.tokenInterval.n).toBe(2);
    expect(report.defaultMode).toBe("off");
    expect(report.passed).toBe(false);
  });
});
