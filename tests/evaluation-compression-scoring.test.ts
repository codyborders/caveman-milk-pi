// Covers task-aware compression scoring through exported evaluator functions.
import { describe, expect, it } from "vitest";
import { aggregateCompressionResults, scoreCompressionPair } from "../scripts/evaluate.mjs";

const result = ({
  mode,
  category,
  output,
  behavioralPassed = true,
  compressionEligible = true,
  targetRatio = 0.8,
}: {
  mode: string;
  category: string;
  output: number;
  behavioralPassed?: boolean;
  compressionEligible?: boolean;
  targetRatio?: number;
}) => ({
  mode,
  category,
  repetition: 0,
  behavioralPassed,
  compressionPolicy: { eligible: compressionEligible, targetRatio },
  usage: { output },
});

describe("task-aware compression scoring", () => {
  it("scores only eligible pairs where both responses pass hard behavior", () => {
    const eligibleOff = result({ mode: "off", category: "explanation", output: 100 });
    const eligibleActive = result({ mode: "lite", category: "explanation", output: 50 });
    const hardFailureOff = result({ mode: "off", category: "coding", output: 100 });
    const hardFailureActive = result({
      mode: "lite",
      category: "coding",
      output: 20,
      behavioralPassed: false,
    });
    const exemptOff = result({ mode: "off", category: "security", output: 100, compressionEligible: false });
    const exemptActive = result({ mode: "lite", category: "security", output: 150, compressionEligible: false });
    const invalidOff = result({ mode: "off", category: "missing-usage", output: 100 });
    const invalidActive = result({ mode: "lite", category: "missing-usage", output: 0 });

    expect(scoreCompressionPair({ off: eligibleOff, active: eligibleActive })).toEqual({
      eligible: true,
      compressionRatio: 0.5,
      brevityScore: 1,
      exclusionReason: null,
    });
    expect(scoreCompressionPair({ off: hardFailureOff, active: hardFailureActive }).exclusionReason).toBe("hard-behavior-failure");
    expect(scoreCompressionPair({ off: exemptOff, active: exemptActive }).exclusionReason).toBe("task-policy-exempt");
    expect(scoreCompressionPair({ off: invalidOff, active: invalidActive }).exclusionReason).toBe("invalid-output-usage");

    expect(
      aggregateCompressionResults([
        eligibleOff,
        eligibleActive,
        hardFailureOff,
        hardFailureActive,
        exemptOff,
        exemptActive,
        invalidOff,
        invalidActive,
      ]).lite,
    ).toEqual({
      pairCount: 4,
      eligiblePairCount: 1,
      excludedHardFailureCount: 1,
      excludedPolicyCount: 1,
      excludedInvalidUsageCount: 1,
      compressionRatio: { mean: 0.5, median: 0.5, count: 1 },
      brevityScore: { mean: 1, median: 1, count: 1 },
    });
  });
});
