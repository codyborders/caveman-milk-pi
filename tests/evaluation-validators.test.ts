// Deterministic validator tests. Each validator must be reproducible without
// any model call.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("terms validator", () => {
  it("passes when every required term appears exactly", () => {
    const outcome = runValidators(
      "cache_key includes model identity.",
      [{ id: "terms" }],
      { ...noTool, requiredTerms: ["cache_key"] },
    );
    expect(outcome.passed).toBe(true);
  });

  it("fails when a required term is missing or altered", () => {
    const altered = runValidators(
      "cachekey includes model identity.",
      [{ id: "terms" }],
      { ...noTool, requiredTerms: ["cache_key"] },
    );
    expect(altered.passed).toBe(false);
    expect(altered.checks[0]?.detail).toContain("cache_key");
  });
});

describe("exact-negation validator", () => {
  const config = { sentence: "Do not delete backups.", core: "delete backups" };

  it("passes when the exact negated sentence survives", () => {
    const outcome = runValidators(
      "Policy reminder: Do not delete backups. Retention is 30 days.",
      [{ id: "exact-negation", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("fails when the negation is dropped even though the core phrase survives", () => {
    const outcome = runValidators(
      "Policy reminder: You may delete backups after review.",
      [{ id: "exact-negation", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("negated sentence");
  });
});
