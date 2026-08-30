// Fresh-v2 derived analysis. Checks source linkage, corrected validation,
// cache eligibility, paired intervals, failure retention, and final gates.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { buildFreshV2Analysis } from "../scripts/eval/fresh-v2-analysis.mjs";

const root = path.resolve(import.meta.dirname, "..");

describe("fresh-v2 analysis", () => {
  it("recomputes protected facts and separates valid cache pairs", () => {
    const analysis = buildFreshV2Analysis();
    expect(analysis.fixture.sha256).toBe("8bd5776b40800d69e238100bfe5ccddf00e6d5ab826919c8c400835f9caf353a");
    expect(analysis.validatorVersion).toBe("schema5-task-success-v14");
    expect(analysis.conditions.cold.cacheEligiblePairs).toBe(55);
    expect(analysis.conditions.warm.cacheEligiblePairs).toBe(65);
    expect(analysis.conditions.cold.correctedSuccess).toEqual({ off: 72, lite: 74 });
    expect(analysis.conditions.warm.correctedSuccess).toEqual({ off: 70, lite: 75 });
    expect(analysis.conditions.cold.armMeans.off.totalTokens).toBeGreaterThan(0);
    expect(analysis.conditions.cold.armMeans.lite.outputTokens).toBeGreaterThan(0);
    expect(analysis.conditions.warm.pairedMetrics.generationDurationMs.count).toBeLessThan(
      analysis.conditions.warm.successfulEligiblePairs,
    );
    expect(analysis.conditions.warm.pairedMetrics.retries.count).toBe(0);
    expect(analysis.conditions.warm.armMeans.off.retries).toBeNull();
    expect(analysis.externalAttempts).toEqual({
      primary: 612,
      judge: 300,
      total: 912,
      providerFailures: 0,
      judgeFailures: 0,
    });
    expect(analysis.correctedResults).toHaveLength(300);
    expect(analysis.correctedResults.every((item) => item.rawPointer.startsWith("/results/"))).toBe(true);
    expect(analysis.correctedResults.every((item) => item.responseSha256.length === 64)).toBe(true);
  });

  it("retains every active-only failure and judge loss with complete responses", () => {
    const analysis = buildFreshV2Analysis();
    expect(analysis.activeOnlyFailures).toHaveLength(1);
    expect(analysis.activeOnlyFailures[0].category).toBe("v2-safety-warning");
    expect(analysis.activeOnlyFailures[0].offResponse.length).toBeGreaterThan(0);
    expect(analysis.activeOnlyFailures[0].liteResponse.length).toBeGreaterThan(0);
    expect(analysis.judgeLosses).toHaveLength(4);
    expect(analysis.judgeLosses.every((item) => item.offResponse && item.liteResponse && item.judgeNotes)).toBe(true);
  });

  it("writes stable JSON and Markdown with a four-axis decision", () => {
    const analysis = buildFreshV2Analysis();
    const saved = JSON.parse(
      readFileSync(path.join(root, "evaluation/results/fresh-v2-analysis-v1.json"), "utf8"),
    );
    const markdown = readFileSync(
      path.join(root, "evaluation/results/fresh-v2-analysis-v1.md"),
      "utf8",
    );
    expect(saved.finalDecision).toEqual(analysis.finalDecision);
    expect(Object.keys(saved.finalDecision.gates)).toEqual([
      "totalTokenReduction",
      "latency",
      "taskSuccess",
      "informationPreservation",
    ]);
    expect(saved.finalDecision.defaultMode).toBe("off");
    expect(markdown).toContain("## Four-axis decision");
    expect(markdown).toContain("Cache placement warning");
    expect(markdown).not.toMatch(/cost|price|dollar/i);
  });
});
