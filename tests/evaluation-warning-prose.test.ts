// Deterministic warning-prose validator tests.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("warning-prose validator", () => {
  const config = { marker: "SECURITY WARNING", minWords: 8 };

  it("passes when the marker sits in a complete prose sentence", () => {
    const outcome = runValidators(
      "SECURITY WARNING: this command grants permanent administrative access to every project.",
      [{ id: "warning-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("fails when the marker appears without a full prose sentence", () => {
    const outcome = runValidators(
      "SECURITY WARNING: admin access grant.",
      [{ id: "warning-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("too short");
  });

  it("fails when the marker is missing", () => {
    const outcome = runValidators(
      "This command grants permanent administrative access to every project you own.",
      [{ id: "warning-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("missing");
  });
});
