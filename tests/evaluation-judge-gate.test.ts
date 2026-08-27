// Blinded judge gate: when explicitly enabled, a lower active-arm quality
// score fails the overall report even though the active output is shorter.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("blinded judge quality gate", () => {
  it("fails overall status when the judge scores the active arm lower", async () => {
    const server = createMockServer();
    server.setJudgeVerdict(() =>
      JSON.stringify({
        completeness: { A: 4, B: 2 },
        correctness: { A: 4, B: 2 },
        notes: "B dropped a required element",
      }),
    );
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { judge: true }),
      );
      expect(report.judge.enabled).toBe(true);
      const active = report.results.find((result) => result.mode === "full");
      expect(active.judge).not.toBeNull();
      expect(active.judge.failed).toBe(false);
      expect(active.qualityPassed).toBe(false);
      expect(active.tokenRatioToOff).toBeCloseTo(0.5, 5);
      expect(active.brevityPassed).toBe(true);
      expect(report.passed).toBe(false);
      expect(report.judgeFailures).toBe(0);
    } finally {
      server.stop();
    }
  });
});
