// Deterministic numbered-order validator tests.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("numbered-order validator", () => {
  const config = { count: 5 };

  it("passes on exactly five ascending steps", () => {
    const text = [
      "Migration:",
      "1. Snapshot the database.",
      "2. Announce maintenance.",
      "3. Apply schema.",
      "4. Verify counts.",
      "5. Reopen access.",
    ].join("\n");
    const outcome = runValidators(text, [{ id: "numbered-order", ...config }], noTool);
    expect(outcome.passed).toBe(true);
  });

  it("fails when the count is wrong", () => {
    const text = ["1. Snapshot.", "2. Announce.", "3. Apply."].join("\n");
    const outcome = runValidators(text, [{ id: "numbered-order", ...config }], noTool);
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("3");
  });

  it("fails when numbering skips or repeats", () => {
    const skipped = [
      "1. Snapshot.",
      "2. Announce.",
      "4. Apply.",
      "5. Verify.",
      "5. Reopen.",
    ].join("\n");
    const outcome = runValidators(skipped, [{ id: "numbered-order", ...config }], noTool);
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("1, 2, 4, 5, 5");
  });

  it("fails when steps are out of order", () => {
    const reversed = [
      "2. Announce.",
      "1. Snapshot.",
      "3. Apply.",
      "4. Verify.",
      "5. Reopen.",
    ].join("\n");
    const outcome = runValidators(reversed, [{ id: "numbered-order", ...config }], noTool);
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("2, 1, 3");
  });
});
