// Hardening slice 3: the judge compares identical-source finalizer arms, so
// prompt attribution never mixes the base product with a finalizer product.
// Judge verdicts feed the critical-loss and unsupported-claim gates while
// judge usage stays outside the primary metrics.

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

async function runReport(judgeImpl) {
  const runner = await loadRunner();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));
  return runner.runSharedPrefixV12Evaluation({
    fixtures,
    provider: "pi",
    allowPaid: true,
    model: "test-model",
    maxPaidProcesses: 100,
    repetitions: 2,
    seed: "0x1",
    workspaceRoot,
    captureDir,
    launchNode: async (request) => {
      const measured = request.phase === "measured";
      const isFinalizer = request.kind === "finalizer";
      const isCandidate = request.arm === "shared-prefix-candidate";
      const cacheRead = measured ? 400 : 0;
      return {
        text: isFinalizer
          ? isCandidate
            ? "candidate final: covers throughput"
            : "off final: covers throughput"
          : "base covers throughput",
        usage: { input: isFinalizer ? 20 : 100, output: 8, cacheRead, cacheWrite: 4 },
        usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
        rawEvents: [],
        elapsedMs: 500,
      };
    },
    judgeImpl,
  });
}

describe("shared-prefix v12 identical-source judge", () => {
  it("fails closed when a judge verdict cannot be parsed", async () => {
    const report = await runReport(async () => ({
      usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0 },
      candidateLostRequiredFact: false,
      candidateUnsupportedClaim: false,
      parseFailed: true,
    }));
    expect(report.judge.parseFailureCount).toBe(2);
    expect(report.gates.zeroUnsupportedClaims).toBe(false);
    expect(report.defaultMode).toBe("off");
  });

  it("judges off versus candidate finals and wires verdicts into the gates", async () => {
    const judgeCalls = [];
    const report = await runReport(async (call) => {
      judgeCalls.push(call);
      return {
        usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0 },
        candidateLostRequiredFact: true,
        candidateUnsupportedClaim: true,
      };
    });
    expect(judgeCalls).toHaveLength(2);
    expect(
      judgeCalls.every(
        (call) =>
          String(call.offText).startsWith("off final:") &&
          String(call.candidateText).startsWith("candidate final:"),
      ),
      "judge must compare identical-source finalizer arms, never base output",
    ).toBe(true);
    expect(report.judge.usageRecords).toHaveLength(2);
    expect(report.eligibleGroup.criticalFinalizerLosses).toBe(1);
    expect(report.unsupportedClaims).toBe(2);
    expect(report.gates.zeroCriticalFinalizerLosses).toBe(false);
    expect(report.gates.zeroUnsupportedClaims).toBe(false);
    expect(report.defaultMode).toBe("off");
    // Judge usage stays outside primary metrics.
    expect(report.isolatedFinalizerComparison.tokenInterval.upperBound).toBe(0);
    expect(report.judge.usageRecords.every((record) => record.usage.input === 50)).toBe(true);
  });
});
