// Controlled cache verification: a cold-labeled run must prove zero cache
// reads on every pair before the condition counts, mixed pairs must stay in
// raw results, and the report records the per-pair classification.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

function eventsWithCacheRead(cacheRead) {
  return [
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Reported with exact values." }],
        usage: { input: 50, output: 9, cacheRead, cacheWrite: 5 },
      },
    }),
  ].join("\n");
}

function piOverrides(stdout) {
  return {
    provider: "pi",
    apiKey: undefined,
    spawnImpl: async () => ({ code: 0, stdout, stderr: "" }),
  };
}

describe("controlled cache verification", () => {
  it("verifies cold eligibility, fails the condition on mixed pairs, and retains raw mixed results", async () => {
    const cold = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        ...piOverrides(eventsWithCacheRead(0)),
        cacheCondition: "cold",
        cachePromptStrategy: "unique-arm",
      }),
    );
    expect(cold.cacheVerification.condition).toBe("cold");
    expect(cold.cacheVerification.pairCount).toBe(3);
    expect(cold.cacheVerification.eligiblePairCount).toBe(3);
    expect(cold.cacheVerification.mixedPairCount).toBe(0);
    expect(cold.cacheVerification.conditionAchieved).toBe(true);
    for (const pair of cold.cacheVerification.pairs) {
      expect(pair.classification).toBe("both-zero");
      expect(pair.verifiedEligible).toBe(true);
    }

    const mixed = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        ...piOverrides(eventsWithCacheRead(12)),
        cacheCondition: "cold",
        cachePromptStrategy: "unique-arm",
      }),
    );
    expect(mixed.cacheVerification.conditionAchieved).toBe(false);
    expect(mixed.cacheVerification.eligiblePairCount).toBe(0);
    expect(mixed.cacheVerification.mixedPairCount).toBe(0);
    expect(mixed.cacheVerification.pairs.every((pair) => pair.classification === "both-positive")).toBe(true);
    // Mixed or ineligible pairs stay in raw results instead of being dropped.
    expect(mixed.results).toHaveLength(6);
    expect(mixed.results.every((result) => result.usage.cacheRead === 12)).toBe(true);
  });
});
