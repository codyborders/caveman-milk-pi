// Run-configuration validation boundary: the repetition floor for comparative
// scoring is enforced before any paid request.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("validateRunConfiguration", () => {
  it("rejects fewer than three repetitions for comparative scoring", () => {
    expect(() =>
      evaluate.validateRunConfiguration({
        modes: ["off", "full"],
        repetitions: 2,
        plannedCalls: 4,
      }),
    ).toThrow(/three repetitions/);
  });
});
