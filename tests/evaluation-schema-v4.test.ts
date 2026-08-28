// Covers schema 4 behavior and graded compression through a loopback provider run.
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("evaluation schema 4", () => {
  it("attributes paired behavior outcomes by category", () => {
    const attribution = evaluate.attributeBehaviorPairs?.([
      { mode: "off", category: "one", repetition: 1, behavioralPassed: true, correctnessPass: true },
      { mode: "full", category: "one", repetition: 1, behavioralPassed: false, correctnessPass: false },
      { mode: "off", category: "two", repetition: 1, behavioralPassed: false, correctnessPass: false },
      { mode: "full", category: "two", repetition: 1, behavioralPassed: true, correctnessPass: true },
      { mode: "off", category: "three", repetition: 1, behavioralPassed: false, correctnessPass: false },
      { mode: "full", category: "three", repetition: 1, behavioralPassed: false, correctnessPass: false },
      { mode: "off", category: "four", repetition: 1, behavioralPassed: true, correctnessPass: true },
      { mode: "full", category: "four", repetition: 1, behavioralPassed: true, correctnessPass: true },
    ]);
    expect(attribution).toMatchObject({
      byMode: {
        full: {
          overall: {
            activeFailedOffPassed: 1,
            activePassedOffFailed: 1,
            bothFailed: 1,
            bothPassed: 1,
          },
          byCategory: {
            one: { activeFailedOffPassed: 1, activePassedOffFailed: 0, bothFailed: 0, bothPassed: 0 },
            two: { activeFailedOffPassed: 0, activePassedOffFailed: 1, bothFailed: 0, bothPassed: 0 },
            three: { activeFailedOffPassed: 0, activePassedOffFailed: 0, bothFailed: 1, bothPassed: 0 },
            four: { activeFailedOffPassed: 0, activePassedOffFailed: 0, bothFailed: 0, bothPassed: 1 },
          },
        },
      },
    });
    expect(attribution.byMode.full.byCategory.one.correctness).toEqual({
      activeFailedOffPassed: 1,
      activePassedOffFailed: 0,
      bothFailed: 0,
      bothPassed: 0,
    });
  });

  it("separates hard behavior from compression metrics", async () => {
    const server = createMockServer();
    server.setCase((mode) => ({
      text: mode === "off" ? "Use cache_key because model identity changes cache entries." : "Use cache_key for model identity.",
      outputTokens: mode === "off" ? 40 : 20,
    }));
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), {
          fixtures: evaluate.loadFixtures("benchmark-regression-v2"),
          modes: ["off", "full"],
          categories: ["technical-explanation"],
          repetitions: 3,
          judge: false,
        }),
      );
      const active = report.results.find((result) => result.mode === "full");

      expect(report.schemaVersion).toBe(4);
      expect(active).toMatchObject({
        correctnessPass: true,
        groundednessPass: true,
        contractPass: true,
        safetyPass: true,
        behavioralPassed: true,
        passed: true,
        compressionRatio: 0.5,
        brevityScore: 1,
        qualityScore: null,
      });
      expect(active).not.toHaveProperty("brevityPassed");
      expect(active).not.toHaveProperty("qualityPassed");
      expect(report.compression.byMode.full.eligiblePairCount).toBe(3);
      expect(report.aggregates.byMode.full.behavioralPassed).toBe(true);
      expect(report.aggregates.byMode.full).not.toHaveProperty("brevityPassed");
      expect(report.aggregates.byMode.full).not.toHaveProperty("qualityPassed");
      expect(report.passed).toBe(true);
    } finally {
      server.stop();
    }
  });

  it("fails hard behavior and excludes compression when a required term is missing", async () => {
    const server = createMockServer();
    server.setCase((mode) => ({
      text: mode === "off" ? "Use cache_key for model identity." : "Use a stable identifier for model identity.",
      outputTokens: mode === "off" ? 40 : 20,
    }));
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), {
          fixtures: evaluate.loadFixtures("benchmark-regression-v2"),
          modes: ["off", "full"],
          categories: ["technical-explanation"],
          repetitions: 3,
          judge: false,
        }),
      );
      const active = report.results.find((result) => result.mode === "full");

      expect(active.contractPass).toBe(false);
      expect(active.behavioralPassed).toBe(false);
      expect(active.passed).toBe(false);
      expect(active.compressionRatio).toBeNull();
      expect(active.brevityScore).toBeNull();
      expect(report.compression.byMode.full.eligiblePairCount).toBe(0);
      expect(report.compression.byMode.full.excludedHardFailureCount).toBe(3);
      expect(report.passed).toBe(false);
    } finally {
      server.stop();
    }
  });
});
