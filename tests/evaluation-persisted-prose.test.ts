// Deterministic persisted-prose validator tests. Persisted artifacts must keep
// normal prose even in aggressive caveman modes.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("persisted-prose validator", () => {
  const config = { minWords: 12, minSentenceRatio: 0.75, minSentenceWords: 5 };

  it("passes on normal full prose", () => {
    const outcome = runValidators(
      "The configuration loader validates the schema before writing anything to disk. " +
        "Failed writes remove the temporary file so no partial state remains.",
      [{ id: "persisted-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("fails on telegraphic fragments", () => {
    const outcome = runValidators(
      "Loader validates schema. Writes atomic. Temp file removed on failure. Config safe.",
      [{ id: "persisted-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("full prose");
  });
});
