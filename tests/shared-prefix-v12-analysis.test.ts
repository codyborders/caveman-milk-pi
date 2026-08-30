// Analysis reporting for the shared-prefix v12 runner: fail-closed gates,
// deterministic paired intervals, exact provider-reported contract overhead
// under matched context, and judge calls kept outside primary metrics. A
// fake launchNode stands in for Pi processes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSharedPrefixV12FinalAnalysis } from "../scripts/eval/shared-prefix-v12-runner.mjs";

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

function fakeLauncher(launches) {
  return async (request) => {
    launches.push(request);
    const measured = request.phase === "measured";
    const isFinalizer = request.kind === "finalizer";
    const isCandidate = request.arm === "shared-prefix-candidate";
    const cacheRead = measured ? 400 : 0;
    if (isFinalizer) {
      return {
        text: "covers throughput",
        usage: {
          input: isCandidate ? 24 : 20,
          output: 8,
          cacheRead,
          cacheWrite: 4,
        },
        usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
        rawEvents: [],
        elapsedMs: 500,
      };
    }
    return {
      text: "base covers throughput",
      usage: { input: 100, output: 30, cacheRead, cacheWrite: 10 },
      usageTurns: [{ input: 100, output: 30, cacheRead, cacheWrite: 10 }],
      rawEvents: [],
      elapsedMs: 1500,
    };
  };
}

async function runReport(overrides = {}) {
  const runner = await loadRunner();
  const launches = [];
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
    launchNode: fakeLauncher(launches),
    ...overrides,
  });
}

describe("shared-prefix v12 analysis reporting", () => {
  it("summarizes final raw report without changing its bytes", () => {
    const raw = fs.readFileSync(path.resolve("evaluation/results/shared-prefix-v12-final-v1.json"), "utf8");
    const report = JSON.parse(raw);
    const analysis = buildSharedPrefixV12FinalAnalysis(report, []);
    expect(analysis.schemaVersion).toBe("shared-prefix-v12-analysis/1");
    expect(analysis.final.status).toBe("final v1");
    expect(analysis.final.validWarmPairs).toBe(35);
    expect(analysis.final.exclusions).toBe(0);
    expect(analysis.eligible.completeProduct.pairedIntervals.tokens).toEqual(report.eligibleGroup.tokenInterval);
    expect(analysis.eligible.contractOverhead.exactTokens).toBe(33);
    expect(analysis.eligible.isolatedSharedPrefix.pairedIntervals.tokens).toEqual(
      report.isolatedFinalizerComparison.tokenInterval,
    );
    expect(analysis.eligible.isolatedSharedPrefix.pairedIntervals.outputTokens).toEqual(
      report.isolatedFinalizerComparison.outputTokenInterval,
    );
    expect(analysis.eligible.isolatedSharedPrefix.pairedIntervals.latency).toEqual(
      report.isolatedFinalizerComparison.latencyInterval,
    );
    expect(analysis.eligible.taskSuccess).toEqual({
      normalOffPassed: 4,
      candidatePassed: 5,
      taskCount: 7,
    });
    expect(analysis.eligible.criticalFinalizerLosses).toBe(1);
    expect(analysis.unsupportedClaims.count).toBe(2);
    expect(analysis.cache.exclusions).toEqual([]);
    expect(analysis.protected.bypass.injectionTokens).toBe(0);
    expect(analysis.protected.bypass.providerCandidatePromptTokens).toBe(0);
    expect(analysis.protected.bypass.extraFinalizerCallsIncludingSetup).toBe(0);
    expect(analysis.protected.bypass.successEqual).toBe(true);
    expect(analysis.protected.bypass.contentComplete).toBe(false);
    expect(analysis.mode.default).toBe("off");
    expect(fs.readFileSync(path.resolve("evaluation/results/shared-prefix-v12-final-v1.json"), "utf8")).toBe(raw);
  });

  it("rejects inconsistent provider-reported contract overhead", () => {
    const report = JSON.parse(
      fs.readFileSync(path.resolve("evaluation/results/shared-prefix-v12-final-v1.json"), "utf8"),
    );
    report.eligibleGroup.contractOverhead[0].exactContractOverheadTokens = 34;
    expect(() => buildSharedPrefixV12FinalAnalysis(report, [])).toThrow(
      /contract overhead/i,
    );
  });

  it("fails closed with empty claims when the candidate adds tokens", async () => {
    const report = await runReport();
    expect(report.defaultMode).toBe("off");
    expect(report.passed).toBe(false);
    expect(report.gates.completeProductTokens).toBe(false);
    expect(report.gates.completeProductLatency).toBe(false);
    expect(report.claims).toEqual([]);
    expect(report.eligibleGroup.tokenInterval.n).toBe(3);
    expect(report.eligibleGroup.tokenInterval.upperBound).toBeGreaterThan(0);
    expect(report.eligibleGroup.latencyInterval.upperBound).toBeGreaterThan(0);
  });

  it("measures exact contract overhead under byte-identical matched context", async () => {
    const report = await runReport();
    expect(report.eligibleGroup.contractOverhead).toHaveLength(3);
    for (const entry of report.eligibleGroup.contractOverhead) {
      expect(entry.contextMatched).toBe(true);
      expect(entry.exactContractOverheadTokens).toBe(4);
      expect(entry.offProcessedInputTokens).toBe(424);
      expect(entry.candidateProcessedInputTokens).toBe(428);
    }
    const hashes = new Set(
      report.eligibleGroup.contractOverhead.map((entry) => entry.canonicalHash),
    );
    expect(hashes.size).toBe(1);
  });

  it("keeps judge usage outside the primary token metrics", async () => {
    const judgeCalls = [];
    const report = await runReport({
      judgeImpl: async ({ taskId, repetition, offText, candidateText, taskPrompt }) => {
        judgeCalls.push({ taskId, repetition, offText, candidateText, taskPrompt });
        return {
          usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0 },
          rawUsage: { input_tokens: 50 },
        };
      },
    });
    expect(judgeCalls).toHaveLength(3);
    // Identical-source arms: the judge sees finalizer products, never the base.
    expect(judgeCalls.every((call) => call.offText === "covers throughput")).toBe(true);
    expect(judgeCalls.every((call) => call.offText !== "base covers throughput")).toBe(true);
    expect(
      judgeCalls.every((call) => typeof call.taskPrompt === "string" && call.taskPrompt.includes("throughput")),
    ).toBe(true);
    expect(report.judge.enabled).toBe(true);
    expect(report.judge.usageRecords).toHaveLength(3);
    expect(
      report.judge.usageRecords.every((record) => record.usage.input === 50),
    ).toBe(true);
    // Judge launches draw from the reservation but never enter tree tokens.
    expect(report.paidProcessAccounting.actual.judge).toBe(3);
    expect(report.eligibleGroup.tokenInterval.upperBound).toBe(436);
    expect(report.paidProcessAccounting.overrun).toBe(false);
  });
});
