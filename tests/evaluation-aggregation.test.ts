// Paired aggregation: deltas for input, cache write, cache read, output,
// latency, quality, and cost appear only when pricing is supplied.

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
