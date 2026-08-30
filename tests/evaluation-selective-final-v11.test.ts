import { describe, expect, it } from "vitest";
import { sumCompleteTreeUsage, completeTreeLatency } from "../scripts/eval/selective-final-v11.mjs";

describe("selective-final v11 evaluation accounting", () => {
  it("sums each complete tree node once and keeps finalizer latency separate", () => {
    const result = { usage: { input: 10, cacheRead: 2, cacheWrite: 3, output: 4 }, elapsedMs: 90, nested: { complete: true, children: [{ usage: { input: 5, cacheRead: 1, cacheWrite: 0, output: 2 }, elapsedMs: 30 }] }, finalizer: { usage: { input: 7, cacheRead: 0, cacheWrite: 0, output: 3 }, elapsedMs: 20 } };
    expect(sumCompleteTreeUsage(result)).toEqual({ input: 22, cacheRead: 3, cacheWrite: 3, output: 9, total: 37 });
    expect(completeTreeLatency(result)).toEqual({ baseMs: 90, finalizerMs: 20, completeMs: 110 });
  });
});
