// Covers blinded quality and grounding scores without turning them into hard behavior gates.
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("blinded judge scoring", () => {
  it("reports normalized scores while hard behavior controls overall status", async () => {
    const server = createMockServer();
    server.setCase((mode) => ({
      text: mode === "off" ? "Use cache_key because model identity changes cache entries." : "Use cache_key for model identity.",
      outputTokens: mode === "off" ? 40 : 20,
    }));
    server.setJudgeVerdict(() =>
      JSON.stringify({
        completeness: { A: 4, B: 2 },
        correctness: { A: 4, B: 2 },
        groundedness: { A: 4, B: 4 },
        notes: "B is less complete but remains grounded",
      }),
    );
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), {
          fixtures: evaluate.loadFixtures("benchmark-regression-v2"),
          modes: ["off", "full"],
          categories: ["technical-explanation"],
          repetitions: 3,
          judge: true,
        }),
      );
      const active = report.results.find((result) => result.mode === "full");

      expect(active.judge).not.toBeNull();
      expect(active.judge.failed).toBe(false);
      expect(active.qualityScore).toBe(0.5);
      expect(active.groundingScore).toBe(1);
      expect(active.behavioralPassed).toBe(true);
      expect(active.passed).toBe(true);
      expect(report.passed).toBe(true);
      expect(report.judgeFailures).toBe(0);
      expect(active.judge.rawUsage).toEqual({ input_tokens: 30, output_tokens: 10 });

      const judgeRequests = server.requests().filter((entry) => entry.body.metadata === undefined);
      expect(judgeRequests.length).toBeGreaterThan(0);
      for (const entry of judgeRequests) {
        const user = entry.body.messages[0].content;
        expect(user).toContain("Task prompt:");
        expect(user).toContain("Response A:");
        expect(user).toContain("Response B:");
        expect(user).not.toMatch(/validation|brevity|requiredTerm|compressionRatio|"usage"/i);
      }
    } finally {
      server.stop();
    }
  });
});
