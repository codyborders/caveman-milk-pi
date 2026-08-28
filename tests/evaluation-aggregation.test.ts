// Paired aggregation: deltas for input, cache write, cache read, output,
// latency, quality, and cost appear only when pricing is supplied.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("paired aggregation", () => {
  it("aggregates paired deltas and computes cost from supplied pricing", async () => {
    const server = createMockServer();
    await server.start();
    const pricing = {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheWritePerMTok: 6.25,
      cacheReadPerMTok: 0.5,
    };
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { pricing, judge: true }),
      );
      const full = report.aggregates.byMode.full;
      expect(full.pairCount).toBe(3);
      expect(full.deltas.inputTokens.mean).toBe(0);
      expect(full.deltas.cacheWriteTokens.mean).toBe(0);
      expect(full.deltas.cacheReadTokens.mean).toBe(0);
      expect(full.deltas.outputTokens.mean).toBe(-20);
      expect(full.deltas.latencyMs.mean).not.toBeNull();
      // Mock judge scores both arms equally, so quality delta is 0.
      expect(full.deltas.qualityTotal.mean).toBe(0);
      const expectedCostDelta = (20 / 1e6) * 25;
      expect(full.deltas.costUsd.mean).toBeCloseTo(-expectedCostDelta, 8);
      expect(report.aggregates.byModeCategory["full::technical-explanation"].pairCount).toBe(3);

      const unpriced = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      expect(unpriced.aggregates.byMode.full.deltas.costUsd).toBe(null);
      expect(unpriced.results.every((result) => result.costUsd === null)).toBe(true);
    } finally {
      server.stop();
    }
  });
});

describe("report summary", () => {
  it("derives corrected attribution from committed report results", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const report = JSON.parse(readFileSync("evaluation/results/benchmark-regression-v2.json", "utf8"));
    const attribution = reportModule.summarizeReport(report).attribution;
    expect(attribution.byMode.lite.byCategory.negation.overall).toEqual({
      activeFailedOffPassed: 2,
      activePassedOffFailed: 0,
      bothFailed: 1,
      bothPassed: 0,
    });
    expect(attribution.byMode.full.byCategory["irreversible-confirmation"].overall).toEqual({
      activeFailedOffPassed: 2,
      activePassedOffFailed: 0,
      bothFailed: 0,
      bothPassed: 1,
    });
    expect(attribution.byMode.lite.byCategory["commit-pr"].overall.bothFailed).toBe(3);
    expect(attribution.byMode.full.byCategory["commit-pr"].overall.bothFailed).toBe(2);
    expect(attribution.byMode.lite.byCategory.clarification.overall.activePassedOffFailed).toBe(1);
    expect(attribution.byMode.lite.byCategory.clarification.overall.activeFailedOffPassed).toBe(1);
  });

  it("renders committed regression status and whole-run usage correctly", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const report = JSON.parse(readFileSync("evaluation/results/benchmark-regression-v2.json", "utf8"));
    const summary = reportModule.summarizeReport(report);
    const byMode = Object.fromEntries(summary.modes.map((mode) => [mode.mode, mode]));
    expect(summary.passed).toBe(false);
    const markdown = reportModule.renderSummaryMarkdown(summary);
    expect(markdown).toContain("| Report passed | no |");
    expect(markdown).toContain("| user contract |");
    expect(byMode.off).toMatchObject({ inputTokens: 18422, cacheWriteTokens: 0, cacheReadTokens: 4160, outputTokens: 16809, totalReportedTokens: 39391, primaryCostUsd: 0 });
    expect(byMode.lite).toMatchObject({ inputTokens: 4733, cacheWriteTokens: 0, cacheReadTokens: 23488, outputTokens: 10314, totalReportedTokens: 38535, totalTokenDifferenceFromOff: -856, primaryCostUsd: 0 });
    expect(byMode.full).toMatchObject({ inputTokens: 4957, cacheWriteTokens: 0, cacheReadTokens: 23360, outputTokens: 12264, totalReportedTokens: 40581, totalTokenDifferenceFromOff: 1190, primaryCostUsd: 0 });
    expect(byMode.lite.totalTokenPercentageDifference).toBeCloseTo(-0.02173, 5);
    expect(byMode.full.totalTokenPercentageDifference).toBeCloseTo(0.03021, 5);
  });

  it("renders schema 4 report status yes only for strict true", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const base = { schemaVersion: 4, modes: ["off"], results: [] };
    expect(reportModule.renderSummaryMarkdown(reportModule.summarizeReport({ ...base, passed: true }))).toContain("| Report passed | yes |");
    expect(reportModule.renderSummaryMarkdown(reportModule.summarizeReport({ ...base, passed: false }))).toContain("| Report passed | no |");
    expect(reportModule.renderSummaryMarkdown(reportModule.summarizeReport({ ...base }))).toContain("| Report passed | no |");
    expect(reportModule.renderSummaryMarkdown(reportModule.summarizeReport({ ...base, passed: "true" }))).toContain("| Report passed | no |");
  });

  it("summarizes pass counts, tokens, costs, attempts, and turns per mode", () => {
    // Optional-call keeps the red phase an assertion mismatch, not a crash:
    // with no summarizeReport export the summary is null and every expect
    // below fails as a plain assertion.
    const summary = evaluate.summarizeReport?.({
      schemaVersion: 3,
      runId: "caveman-eval-test",
      provider: "pi",
      runner: "pi",
      model: "test-model",
      seed: "0xa1b2c3d4",
      judge: { enabled: true, model: "judge-model", tolerance: 0 },
      pricing: {
        inputPerMTok: 3,
        outputPerMTok: 15,
        cacheWritePerMTok: 3.75,
        cacheReadPerMTok: 0.3,
      },
      paidCallAccounting: {
        cap: 225,
        actual: { provider: 6, judge: 3, countEndpoint: 4, total: 13 },
      },
      aggregates: {
        byMode: {
          full: { outputTokenRatio: { mean: 0.8125, median: 0.8, count: 3 } },
        },
      },
      results: [
        {
          mode: "off",
          validationPassed: true,
          brevityPassed: true,
          qualityPassed: true,
          passed: true,
          costUsd: 0.002,
          assistantTurns: 1,
          usage: { input: 100, output: 40, cacheWrite: 50, cacheRead: 25 },
          judge: null,
        },
        {
          mode: "full",
          validationPassed: true,
          brevityPassed: false,
          qualityPassed: true,
          passed: false,
          costUsd: 0.001,
          assistantTurns: 2,
          usage: { input: 110, output: 32, cacheWrite: 45, cacheRead: 20 },
          judge: {
            failed: false,
            assistantTurns: 1,
            costUsd: 0.003,
            usage: { input: 30, output: 10, cacheWrite: 4, cacheRead: 6 },
          },
        },
        {
          mode: "full",
          validationPassed: true,
          brevityPassed: true,
          qualityPassed: true,
          passed: true,
          costUsd: 0.001,
          assistantTurns: 1,
          usage: { input: 105, output: 30, cacheWrite: 40, cacheRead: 22 },
          judge: {
            failed: false,
            assistantTurns: 1,
            costUsd: 0.004,
            usage: { input: 28, output: 9, cacheWrite: 1, cacheRead: 2 },
          },
        },
      ],
    }) ?? null;

    expect(summary).not.toBeNull();
    expect(summary.schemaVersion).toBe(3);
    expect(summary.passed).toBe(false);
    expect(summary.runId).toBe("caveman-eval-test");
    expect(summary.judgeEnabled).toBe(true);

    const off = summary.modes.find((entry) => entry.mode === "off");
    expect(off).toEqual({
      mode: "off",
      cases: 1,
      passedCases: 1,
      validatorPasses: 1,
      brevityPasses: 1,
      judgeQualityPasses: null,
      inputTokens: 100,
      cacheWriteTokens: 50,
      cacheReadTokens: 25,
      outputTokens: 40,
      primaryCostUsd: 0.002,
      pairedOutputMean: null,
      pairedOutputMedian: null,
    });

    const full = summary.modes.find((entry) => entry.mode === "full");
    expect(full.cases).toBe(2);
    expect(full.passedCases).toBe(1);
    expect(full.validatorPasses).toBe(2);
    expect(full.brevityPasses).toBe(1);
    expect(full.judgeQualityPasses).toBe(2);
    expect(full.inputTokens).toBe(215);
    expect(full.cacheWriteTokens).toBe(85);
    expect(full.cacheReadTokens).toBe(42);
    expect(full.outputTokens).toBe(62);
    expect(full.primaryCostUsd).toBe(0.002);
    expect(full.pairedOutputMean).toBe(0.8125);
    expect(full.pairedOutputMedian).toBe(0.8);

    expect(summary.totals.judgeCostUsd).toBe(0.007);
    expect(summary.totals.primaryCostUsd).toBe(0.004);
    expect(summary.totals.assistantModelTurns).toBe(6);
    expect(summary.totals.countedProcessAttempts).toEqual({
      provider: 6,
      judge: 3,
      countEndpoint: 4,
      total: 13,
    });
    expect(summary.totals.paidCallCap).toBe(225);
  });

  it("formats whole-run percentage differences as percentages", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const summary = reportModule.summarizeReport({
      schemaVersion: 4,
      modes: ["off", "lite", "full"],
      results: [
        { mode: "off", usage: { input: 100, cacheWrite: 0, cacheRead: 0, output: 0 } },
        { mode: "lite", usage: { input: 97, cacheWrite: 0, cacheRead: 0, output: 0 } },
        { mode: "full", usage: { input: 103, cacheWrite: 0, cacheRead: 0, output: 0 } },
      ],
    });
    expect(summary.modes.find((mode) => mode.mode === "lite").totalTokenPercentageDifference).toBe(-0.03);
    expect(reportModule.renderSummaryMarkdown(summary)).toContain("| `lite` | 97 | 0 | 0 | 0 | 97 | -3 | -3.0% |");
    expect(reportModule.renderSummaryMarkdown(summary)).toContain("| `full` | 103 | 0 | 0 | 0 | 103 | 3 | +3.0% |");
  });

  it("keeps missing usage nullable, sums multi-turn rows, and preserves zero cost", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const summary = reportModule.summarizeReport({
      schemaVersion: 4,
      modes: ["off", "lite"],
      results: [
        { mode: "off", usage: { input: 10, cacheWrite: 0, cacheRead: 2, output: 8 }, costUsd: 0 },
        { mode: "off", usage: { input: 12, cacheWrite: 0, cacheRead: 3, output: 7 }, costUsd: 0 },
        { mode: "lite", usage: { input: 5, cacheRead: 1, output: 4 }, costUsd: 0 },
      ],
    });
    const off = summary.modes.find((mode) => mode.mode === "off");
    const lite = summary.modes.find((mode) => mode.mode === "lite");
    expect(off).toMatchObject({ inputTokens: 22, cacheReadTokens: 5, outputTokens: 15, totalReportedTokens: 42, primaryCostUsd: 0 });
    expect(lite).toMatchObject({ cacheWriteTokens: null, totalReportedTokens: null, totalTokenDifferenceFromOff: null, totalTokenPercentageDifference: null });
  });

  it("summarizes schema 4 hard groups and graded metrics without legacy gates", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const summary = reportModule.summarizeReport({
      schemaVersion: 4,
      fixtureSet: "fresh-v1",
      fixtureHash: "fresh-hash",
      runId: "schema4-run",
      passed: false,
      modes: ["off", "full"],
      judge: { enabled: true, model: "judge-model" },
      attribution: {
        byMode: {
          full: {
            overall: { activeFailedOffPassed: 1, activePassedOffFailed: 0, bothFailed: 0, bothPassed: 0 },
            byCategory: {
              negation: {
                activeFailedOffPassed: 1,
                activePassedOffFailed: 0,
                bothFailed: 0,
                bothPassed: 0,
                correctness: { activeFailedOffPassed: 1, activePassedOffFailed: 0, bothFailed: 0, bothPassed: 0 },
              },
            },
          },
        },
      },
      compression: {
        byMode: {
          full: {
            pairCount: 1,
            eligiblePairCount: 1,
            excludedHardFailureCount: 0,
            excludedPolicyCount: 0,
            excludedInvalidUsageCount: 0,
            compressionRatio: { mean: 0.5, median: 0.5, count: 1 },
            brevityScore: { mean: 1, median: 1, count: 1 },
          },
        },
      },
      results: [
        {
          mode: "off",
          passed: true,
          behavioralPassed: true,
          correctnessPass: true,
          groundednessPass: true,
          contractPass: true,
          safetyPass: true,
          qualityScore: null,
          groundingScore: null,
          costUsd: 0,
          assistantTurns: 1,
          usage: { input: 10, output: 20, cacheWrite: 0, cacheRead: 0 },
          judge: null,
        },
        {
          mode: "full",
          passed: true,
          behavioralPassed: true,
          correctnessPass: true,
          groundednessPass: true,
          contractPass: true,
          safetyPass: true,
          qualityScore: 0.75,
          groundingScore: 1,
          costUsd: 0,
          assistantTurns: 1,
          usage: { input: 10, output: 10, cacheWrite: 0, cacheRead: 0 },
          judge: { failed: false, assistantTurns: 1, costUsd: 0.01 },
        },
      ],
    });
    const markdown = reportModule.renderSummaryMarkdown(summary);
    const full = summary.modes.find((mode) => mode.mode === "full");

    expect(summary.fixtureSet).toBe("fresh-v1");
    expect(summary.fixtureHash).toBe("fresh-hash");
    expect(summary.attribution.byMode.full.overall.activeFailedOffPassed).toBe(1);
    expect(full).toMatchObject({
      behavioralPasses: 1,
      correctnessPasses: 1,
      groundednessPasses: 1,
      contractPasses: 1,
      safetyPasses: 1,
      qualityScoreMean: 0.75,
      groundingScoreMean: 1,
      brevityScoreMean: 1,
      compressionRatioMean: 0.5,
      compressionEligiblePairs: 1,
    });
    expect(markdown).toContain("| Fixture set | `fresh-v1` |");
    expect(markdown).toContain("| Report passed | no |");
    expect(markdown).toContain("Active-failed/off-passed");
    expect(markdown).toContain("### Whole-run usage");
    expect(markdown).toContain("### Paired output and eligible compression");
    expect(markdown).toContain("| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |");
    expect(markdown).not.toContain("Judge quality pass");
  });

  it("renders deterministic markdown with the process-cap versus tool-loop explanation", async () => {
    const reportModule = await import("../scripts/eval/report-summary.mjs");
    const summary = evaluate.summarizeReport({
      schemaVersion: 3,
      runId: "caveman-eval-md",
      provider: "pi",
      runner: "pi",
      model: "test-model",
      seed: "0xdeadbeef",
      modes: ["off", "full"],
      repetitions: 3,
      environment: {
        commit: "abcdef1234567890",
        piVersion: "0.84.3",
      },
      runIdentity: {
        runtimePromptHash: "runtime-hash",
        promptContractHash: "contract-hash",
      },
      judge: { enabled: true, model: "judge-model", tolerance: 0 },
      pricing: null,
      paidCallAccounting: {
        cap: 225,
        actual: { provider: 6, judge: 3, countEndpoint: 4, total: 13 },
      },
      aggregates: {
        byMode: {
          full: { outputTokenRatio: { mean: 0.8125, median: 0.8, count: 3 } },
        },
      },
      results: [
        {
          mode: "off",
          validationPassed: true,
          brevityPassed: true,
          qualityPassed: true,
          passed: true,
          costUsd: 0.002,
          assistantTurns: 1,
          usage: { input: 100, output: 40, cacheWrite: 50, cacheRead: 25 },
          judge: null,
        },
        {
          mode: "full",
          validationPassed: true,
          brevityPassed: true,
          qualityPassed: true,
          passed: true,
          costUsd: 0.001,
          assistantTurns: 2,
          usage: { input: 110, output: 32, cacheWrite: 45, cacheRead: 20 },
          judge: {
            failed: false,
            assistantTurns: 1,
            usage: { input: 30, output: 10, cacheWrite: 4, cacheRead: 6 },
          },
        },
      ],
    });
    const markdown = reportModule.renderSummaryMarkdown?.(summary) ?? null;

    expect(markdown).not.toBeNull();
    expect(markdown).toContain("# Evaluation Report Summary");
    expect(markdown).toContain("| Run | `caveman-eval-md` |");
    expect(markdown).toContain("| Schema | 3 |");
    expect(markdown).toContain("| Evaluator commit | `abcdef1234567890` |");
    expect(markdown).toContain("| Pi version | `0.84.3` |");
    expect(markdown).toContain("| Runtime prompt hash | `runtime-hash` |");
    expect(markdown).toContain("| Prompt contract hash | `contract-hash` |");
    expect(markdown).toContain("| Repetitions | 3 |");
    expect(markdown).toContain("| Mode | Cases | Passed | Validator | Brevity | Judge quality |");
    expect(markdown).toContain("| `full` | 1 | 1 | 1 | 1 | 1 |");
    expect(markdown).toContain("| `off` | 1 | 1 | 1 | 1 | n/a |");
    expect(markdown).toContain("| Assistant model turns | 4 |");
    expect(markdown).toContain("| Counted process attempts | 13 total (6 primary, 3 judge, 4 count) |");
    expect(markdown).toContain("| Paid-call cap | 225 |");
    expect(markdown).toContain("0.8125");
    expect(markdown).toContain("0.8000");
    // The cap-vs-turns explanation must appear verbatim in every render.
    expect(markdown).toContain(
      "Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.",
    );
    // Deterministic: same summary renders identical bytes.
    expect(reportModule.renderSummaryMarkdown(summary)).toBe(markdown);
  });
});
