// Deterministic validator tests. Each validator must be reproducible without
// any model call.

import { describe, expect, it } from "vitest";
import { runRequirements, runValidators } from "../scripts/eval/validators.mjs";

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

describe("exact-term matching", () => {
  it("matches natural-language phrases without case sensitivity", () => {
    const outcome = runRequirements(
      "Complete the check Before Deployment.",
      [{ kind: "exact-term", value: "before deployment", caseSensitive: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("ignores Markdown emphasis around the required phrase", () => {
    const outcome = runRequirements(
      "Complete the check **before deployment**.",
      [{ kind: "exact-term", value: "before deployment", caseSensitive: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("keeps identifiers case-sensitive by default", () => {
    const outcome = runRequirements(
      "Use CACHE_KEY for the lookup.",
      [{ kind: "exact-term", value: "cache_key" }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
  });

  it("honors explicit case-sensitive natural-language requirements", () => {
    const outcome = runRequirements(
      "config migration is ready.",
      [{ kind: "exact-term", value: "Config migration", caseSensitive: true }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
  });

  it("preserves punctuation while matching Unicode text without case sensitivity", () => {
    const passing = runRequirements(
      "部署前，請確認。",
      [{ kind: "exact-term", value: "部署前，請確認。", caseSensitive: false }],
      noTool,
    );
    const failing = runRequirements(
      "部署前請確認",
      [{ kind: "exact-term", value: "部署前，請確認。", caseSensitive: false }],
      noTool,
    );
    expect(passing.passed).toBe(true);
    expect(failing.passed).toBe(false);
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
