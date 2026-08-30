// Hardening slice 2: isolated shared-prefix off-versus-candidate deltas with
// paired intervals stay separate from the complete-product normal-off versus
// candidate metrics. The isolated comparison attributes prompt effects
// between identical-source finalizer arms only.

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

async function runReport() {
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
    launchNode: async (request) => {
      const measured = request.phase === "measured";
      const isFinalizer = request.kind === "finalizer";
      const isCandidate = request.arm === "shared-prefix-candidate";
      const cacheRead = measured ? 400 : 0;
      return {
        text: "covers throughput",
        usage: {
          input: isFinalizer ? (isCandidate ? 24 : 20) : 100,
          output: isFinalizer ? (isCandidate ? 6 : 8) : 30,
          cacheRead,
          cacheWrite: isFinalizer ? 4 : 10,
        },
        usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
        rawEvents: [],
        elapsedMs: isFinalizer ? (isCandidate ? 450 : 500) : 1500,
      };
    },
  });
}

describe("shared-prefix v12 isolated finalizer comparison", () => {
  it("reports off-versus-candidate deltas and intervals separate from complete-product metrics", async () => {
    const report = await runReport();
    const isolated = report.isolatedFinalizerComparison;
    expect(isolated).toBeDefined();
    expect(isolated.pairs).toHaveLength(3);
    for (const pair of isolated.pairs) {
      // Finalizer-arm deltas only: candidate minus off per repetition.
      expect(pair.tokenDelta).toBe((24 + 400 + 4 + 6) - (20 + 400 + 4 + 8));
      expect(pair.outputTokenDelta).toBe(6 - 8);
      expect(pair.latencyDelta).toBe(450 - 500);
    }
    expect(isolated.tokenInterval.n).toBe(3);
    expect(isolated.tokenInterval.upperBound).toBe(2);
    expect(isolated.outputTokenInterval.upperBound).toBe(-2);
    expect(isolated.latencyInterval.upperBound).toBe(-50);
    // Complete-product metrics remain the normal-off versus candidate view.
    expect(report.eligibleGroup.tokenInterval.upperBound).toBeGreaterThan(0);
    expect(report.eligibleGroup.tokenInterval.n).toBe(3);
  });
});
