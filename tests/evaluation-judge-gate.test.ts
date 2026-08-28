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
      // The judge result preserves the raw provider usage object verbatim.
      expect(active.judge.rawUsage).toEqual({ input_tokens: 30, output_tokens: 10 });
      expect(active.judge.usage).toEqual({ input: 30, output: 10, cacheWrite: null, cacheRead: null });
      expect(active.qualityPassed).toBe(false);
      expect(active.tokenRatioToOff).toBeCloseTo(0.5, 5);
      expect(active.brevityPassed).toBe(true);
      expect(report.passed).toBe(false);
      expect(report.judgeFailures).toBe(0);

      // Independence: the judge sees only the task prompt and the two
      // responses. No validator outcome, brevity verdict, or usage data may
      // leak into the blinded judge payload.
      const judgeRequests = server
        .requests()
        .filter((entry) => entry.body.metadata === undefined);
      expect(judgeRequests.length).toBeGreaterThan(0);
      for (const entry of judgeRequests) {
        const user = entry.body.messages[0].content;
        expect(user).toContain("Task prompt:");
        expect(user).toContain("Response A:");
        expect(user).toContain("Response B:");
        expect(user).not.toMatch(/validation|brevityPassed|requiredTerm|tokenRatio|"usage"/i);
      }
    } finally {
      server.stop();
    }
  });
});
