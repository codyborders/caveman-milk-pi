// Evaluator result metadata for controlled paired runs: pair order, cache
// condition, timing nulls for non-streaming direct calls, retry counts,
// tool metrics, and normalized per-turn usage. Red initial failure: results
// carried none of these fields.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const fixtures = {
  version: 5,
  fixtureSet: "fresh-v2",
  fixtureHash: "0".repeat(64),
  modes: ["off", "lite"],
  categories: [
    {
      id: "metadata-case",
      taskClass: "short-factual",
      prompt: "State the default port and confirm it cannot be changed at runtime.",
      requirements: [
        {
          id: "facts",
          kind: "protected-facts",
          hardGroup: "correctness",
          protected: true,
          requiredClaims: [{ id: "port", text: "The default port is 9430." }],
          negatedClaims: [
            { id: "runtime", sentence: "The port cannot be changed at runtime.", core: "changed at runtime" },
          ],
          numbers: [{ id: "port-number", value: 9430 }],
        },
      ],
      compressionPolicy: { eligible: false, reason: "exact facts" },
    },
  ],
  promptContract: {
    commonRules: "Use short sentences. Keep exact values.",
    modeRules: { lite: " Lite adds nothing else." },
    tokenAccounting: { method: "provider-count-endpoint", endpointPath: "/v1/messages/count_tokens" },
  },
  runtimePrompts: { off: "", lite: "\n\nCAVEMAN MODE ACTIVE - level: lite" },
};

function providerPayload(text) {
  return {
    content: [{ type: "text", text }],
    usage: {
      input_tokens: 100,
      output_tokens: 30,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 25,
    },
  };
}

describe("evaluator result metadata", () => {
  it("records pair order, cache condition, timing, retries, tool metrics, and per-turn usage", async () => {
    const calls = [];
    let failOnce = true;
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      const metadata = JSON.parse(calls.at(-1).body.metadata?.user_id ?? "{}");
      if (metadata.mode === "lite" && failOnce) {
        failOnce = false;
        return { ok: false, status: 500, headers: { get: () => null }, text: async () => "boom" };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () =>
          providerPayload(
            "The default port is 9430. The port cannot be changed at runtime.",
          ),
      };
    };

    const report = await evaluate.runProviderEvaluation({
      apiKey: "test-key",
      model: "test-model",
      allowPaid: true,
      provider: "anthropic",
      fetchImpl,
      fixtures,
      repetitions: 3,
      seed: "0xa1b2c3d4",
      pairOrderStrategy: "alternating",
      execGit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      readPiVersion: () => "0.84.3",
      sleepImpl: async () => {},
    });

    expect(report.results).toHaveLength(6);
    for (const result of report.results) {
      expect(result.pairOrder.order).toEqual(expect.arrayContaining(["off", "lite"]));
      expect(result.pairOrder.order).toHaveLength(2);
      expect(result.pairOrder.position).toBe(result.armPosition);
      expect(result.pairOrder.ranFirst).toBe(result.armPosition === 0);
      // Non-streaming direct calls cannot observe token timing.
      expect(result.timing.timeToFirstTokenMs).toBeNull();
      expect(result.timing.generationDurationMs).toBeNull();
      expect(result.timing.totalElapsedMs).toBe(result.elapsedMs);
      expect(result.toolMetrics.toolCalls).toBe(0);
      expect(result.toolMetrics.toolDurationMs).toBeNull();
      expect(result.toolMetrics.rereads).toBeNull();
      expect(result.toolMetrics.correctiveTurns).toBeNull();
      expect(result.toolMetrics.failedTestsWithoutCorrectiveTurn).toBeNull();
      expect(result.sessionToolMetrics).toBeNull();
      // Cache condition is recorded from the request shape and usage.
      expect(result.cacheCondition.promptCacheEligible).toBe(true);
      expect(result.cacheCondition.cacheReadTokens).toBe(25);
      expect(result.cacheCondition.cacheWriteTokens).toBe(50);
      expect(result.usageTurns).toEqual([
        { input: 100, output: 30, cacheWrite: 50, cacheRead: 25 },
      ]);
      expect(result.protectedFactManifest.requiredClaims).toEqual([
        { id: "port", text: "The default port is 9430." },
      ]);
      expect(result.preservation).toMatchObject({
        criticalOmissionCount: 0,
        noncriticalOmissionCount: 0,
        alteredFactCount: 0,
        unsupportedClaimCount: 0,
        orderingErrorCount: 0,
      });
    }
    const firstByRepetition = [1, 2, 3].map((repetition) =>
      report.results.find((result) => result.repetition === repetition && result.armPosition === 0)?.mode,
    );
    expect(firstByRepetition).toEqual(["off", "lite", "off"]);

    // The retried lite call records its retry: one failed attempt then a
    // success, with external attempts never hidden.
    const retried = report.results.filter((result) => result.attempts === 2);
    expect(retried).toHaveLength(1);
    expect(retried[0].toolMetrics.retries).toBe(1);
    expect(report.results.filter((result) => result.attempts === 1)).toHaveLength(5);
    expect(report.paidCallAccounting.actual.provider).toBe(7);
  });

  it("rejects a workspace category under a non-Pi provider before any request", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => providerPayload("The default port is 9430."),
      };
    };
    await expect(
      evaluate.runProviderEvaluation({
        apiKey: "test-key",
        model: "test-model",
        allowPaid: true,
        provider: "anthropic",
        fetchImpl,
        fixtures: {
          ...fixtures,
          categories: [
            {
              ...fixtures.categories[0],
              workspace: { files: { "src/a.ts": "export const a = 1;\n" } },
            },
          ],
        },
        repetitions: 3,
        seed: "0xa1b2c3d4",
        execGit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        readPiVersion: () => "0.84.3",
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow(/workspace .*pi provider/i);
    expect(calls).toHaveLength(0);
  });
});
