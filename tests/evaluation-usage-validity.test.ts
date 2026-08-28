// Usage validity: paired token metrics are only meaningful when the provider
// reports usage for both arms. Missing or non-positive output usage must
// invalidate the ratio, fail brevity fail-closed, and stay out of deltas.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

function usageCaseServer(transform) {
  const server = createMockServer();
  server.setCase(transform);
  return server;
}

describe("usage validity", () => {
  it("fails brevity and overall pass when only the active arm lacks usage", async () => {
    const server = usageCaseServer((mode) => {
      if (mode === "off") return { text: "Do not delete backups. cache_key uses model identity.", outputTokens: 40 };
      return { text: "Do not delete backups. cache_key identity.", outputTokens: null };
    });
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const active = report.results.find((result) => result.mode === "full" && result.repetition === 1);
      expect(active.usage.output).toBeNull();
      expect(active.tokenRatioToOff).toBeNull();
      expect(active.brevityPassed).toBe(false);
      expect(active.passed).toBe(false);
      expect(report.passed).toBe(false);
      const full = report.aggregates.byMode.full;
      expect(full.completePairCount).toBe(0);
      expect(full.incompletePairCount).toBe(3);
      expect(full.outputTokenRatio).toBeNull();
      expect(full.deltas.outputTokens).toBeNull();
    } finally {
      server.stop();
    }
  });

  it("fails brevity when only the off arm lacks usage", async () => {
    const server = usageCaseServer((mode) => {
      if (mode === "off") return { text: "Do not delete backups. cache_key uses model identity.", outputTokens: null };
      return { text: "Do not delete backups. cache_key identity.", outputTokens: 20 };
    });
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const active = report.results.find((result) => result.mode === "full" && result.repetition === 1);
      expect(active.tokenRatioToOff).toBeNull();
      expect(active.brevityPassed).toBe(false);
      expect(report.passed).toBe(false);
      expect(report.aggregates.byMode.full.incompletePairCount).toBe(3);
    } finally {
      server.stop();
    }
  });

  it("treats zero output tokens as an incomplete pair that fails brevity", async () => {
    const server = usageCaseServer((mode) => {
      if (mode === "off") return { text: "Do not delete backups. cache_key uses model identity.", outputTokens: 0 };
      return { text: "Do not delete backups. cache_key identity.", outputTokens: 20 };
    });
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const active = report.results.find((result) => result.mode === "full" && result.repetition === 1);
      expect(active.tokenRatioToOff).toBeNull();
      expect(active.brevityPassed).toBe(false);
      const full = report.aggregates.byMode.full;
      expect(full.completePairCount).toBe(0);
      expect(full.incompletePairCount).toBe(3);
      expect(full.outputTokenRatio).toBeNull();
    } finally {
      server.stop();
    }
  });

  it("reports complete and incomplete pair counts separately for mixed runs", async () => {
    const server = usageCaseServer((mode, metadata) => {
      const broken = metadata.repetition === 2;
      if (mode === "off") {
        return {
          text: "Do not delete backups. cache_key uses model identity.",
          outputTokens: broken ? null : 40,
        };
      }
      return { text: "Do not delete backups. cache_key identity.", outputTokens: broken ? null : 20 };
    });
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const full = report.aggregates.byMode.full;
      expect(full.pairCount).toBe(3);
      expect(full.completePairCount).toBe(2);
      expect(full.incompletePairCount).toBe(1);
      expect(full.outputTokenRatio.count).toBe(2);
      expect(full.outputTokenRatio.mean).toBeCloseTo(0.5, 6);
      expect(full.deltas.outputTokens.count).toBe(2);
      expect(full.deltas.outputTokens.mean).toBeCloseTo(-20, 6);
      expect(report.passed).toBe(false);
    } finally {
      server.stop();
    }
  });

  it("preserves the raw provider usage object verbatim on every result", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      for (const result of report.results) {
        expect(result.rawUsage).toEqual({
          input_tokens: 100,
          output_tokens: result.mode === "off" ? 40 : 20,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 25,
        });
      }
    } finally {
      server.stop();
    }
  });

  it("computes no cost when any pricing-relevant usage field is unavailable", async () => {
    const fixtures = evaluate.loadFixtures();
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      const metadata = JSON.parse(body.metadata.user_id);
      // Cache fields are absent, so pricing can never substitute zero.
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text:
                metadata.mode === "off"
                  ? "Do not delete backups. cache_key uses model identity."
                  : "Do not delete backups. cache_key identity.",
            },
          ],
          usage: { input_tokens: 100, output_tokens: metadata.mode === "off" ? 40 : 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const report = await evaluate.runProviderEvaluation({
      apiKey: "k",
      model: "m",
      allowPaid: true,
      endpoint: "http://x/v1/messages",
      fetchImpl,
      fixtures: { ...fixtures, modes: ["off", "full"], categories: [fixtures.categories[0]] },
      modes: ["off", "full"],
      categories: ["technical-explanation"],
      repetitions: 3,
      seed: "0x5",
      execGit: () => "deadbeef",
      readPiVersion: () => "0",
      sleepImpl: async () => {},
      pricing: {
        inputPerMTok: 5,
        outputPerMTok: 25,
        cacheWritePerMTok: 6.25,
        cacheReadPerMTok: 0.5,
      },
    });
    for (const result of report.results) {
      expect(result.usage.cacheWrite).toBeNull();
      expect(result.costUsd).toBeNull();
    }
    expect(report.aggregates.byMode.full.deltas.costUsd).toBeNull();
  });

  it("requires positive integer output usage for every result, including off-only runs", async () => {
    const fixtures = evaluate.loadFixtures();
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "cache_key uses model identity." }],
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const report = await evaluate.runProviderEvaluation({
      apiKey: "k",
      model: "m",
      allowPaid: true,
      endpoint: "http://x/v1/messages",
      fetchImpl,
      fixtures: { ...fixtures, modes: ["off"], categories: [fixtures.categories[0]] },
      modes: ["off"],
      categories: ["technical-explanation"],
      repetitions: 3,
      seed: "0x5",
      execGit: () => "deadbeef",
      readPiVersion: () => "0",
      sleepImpl: async () => {},
    });
    expect(report.primaryUsageComplete).toBe(false);
    expect(report.passed).toBe(false);
  });
});
