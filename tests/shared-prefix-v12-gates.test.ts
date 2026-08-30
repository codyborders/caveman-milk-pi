// Deterministic paired intervals and release gates for shared-prefix v12.
// The token and latency gates require the one-sided 95% upper bound of the
// paired candidate-minus-off deltas to sit below zero. Any gate failure
// keeps the recommended mode off (fail closed).

import { describe, expect, it } from "vitest";
import { pairedUpperInterval } from "../scripts/eval/shared-prefix-v12.mjs";

// One-sided 95% critical value for Student t with 4 degrees of freedom,
// taken from the standard table (2.1318) so the interval check does not
// simply restate the implementation's own quantile.
const T_DF4_ONE_SIDED_95 = 2.1318;
describe("deterministic paired intervals", () => {
  it("computes the one-sided upper bound from paired deltas deterministically", () => {
    const deltas = [-10, -20, -15, -25, -5];
    const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const variance =
      deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (deltas.length - 1);
    const standardError = Math.sqrt(variance / deltas.length);
    const expectedUpper = mean + T_DF4_ONE_SIDED_95 * standardError;

    const first = pairedUpperInterval(deltas, 0.95);
    const second = pairedUpperInterval(deltas, 0.95);
    expect(second).toEqual(first);
    expect(first.n).toBe(5);
    expect(first.mean).toBeCloseTo(mean, 10);
    expect(first.upperBound).toBeCloseTo(expectedUpper, 3);
    expect(first.upperBound).toBeLessThan(0);
  });

  it("fails closed on any failed gate", async () => {
    const evaluator = await import("../scripts/eval/shared-prefix-v12.mjs");
    expect(typeof evaluator.evaluateSharedPrefixV12Gates).toBe("function");
    const base = {
      tokenUpper95: -7.46,
      latencyUpper95: -2.5,
      candidateSuccessCount: 5,
      offSuccessCount: 5,
      eligibleTaskCount: 5,
      criticalFinalizerLosses: 0,
      unsupportedClaims: 0,
      protectedInjectionTokens: 0,
      protectedSuccessEqual: true,
      protectedContentComplete: true,
      protectedExtraFinalizerWork: 0,
    };
    const passing = evaluator.evaluateSharedPrefixV12Gates(base);
    expect(passing.passed).toBe(true);
    expect(passing.defaultMode).toBe("shared-prefix-v12");

    const tokenFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, tokenUpper95: 0 });
    expect(tokenFail.passed).toBe(false);
    expect(tokenFail.defaultMode).toBe("off");

    const nullInterval = evaluator.evaluateSharedPrefixV12Gates({ ...base, tokenUpper95: null });
    expect(nullInterval.passed).toBe(false);

    const latencyFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, latencyUpper95: -0.0 });
    expect(latencyFail.passed).toBe(false);

    const successFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, candidateSuccessCount: 3 });
    expect(successFail.passed).toBe(false);

    const lossFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, criticalFinalizerLosses: 1 });
    expect(lossFail.passed).toBe(false);

    const claimFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, unsupportedClaims: 1 });
    expect(claimFail.passed).toBe(false);

    const protectedFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, protectedInjectionTokens: 12 });
    expect(protectedFail.passed).toBe(false);

    const extraWorkFail = evaluator.evaluateSharedPrefixV12Gates({ ...base, protectedExtraFinalizerWork: 1 });
    expect(extraWorkFail.passed).toBe(false);
  });
});
