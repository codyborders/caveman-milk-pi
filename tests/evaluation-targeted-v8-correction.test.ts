// Targeted-v8 correction generator contract: a derived report must recompute
// validation truthfully with the corrected validator while every measured
// field stays byte-identical to the paid source. Red initial failure: the
// generator module did not exist (ERR_MODULE_NOT_FOUND observed first).

import { describe, expect, it } from "vitest";
import { buildTargetedV8Correction } from "../scripts/eval/targeted-v8-correction.mjs";

describe("targeted-v8 correction generator", () => {
  it("recomputes active modes to 40/40 while off keeps its exact-target failures", () => {
    const correction = buildTargetedV8Correction();

    expect(correction.correction.originalValidatorVersion).toBe("schema4-corrected-v10");
    expect(correction.correction.correctedValidatorVersion).toBe("schema4-corrected-v12");
    expect(correction.correction.recomputedHardPasses).toEqual({
      off: { passed: 37, total: 40 },
      lite: { passed: 40, total: 40 },
      full: { passed: 40, total: 40 },
    });
    expect(correction.passed).toBe(false);
    expect(
      correction.results
        .filter((result) => result.mode === "off" && !result.behavioralPassed)
        .map((result) => result.category),
    ).toEqual([
      "irreversible-confirmation",
      "irreversible-confirmation",
      "irreversible-confirmation",
    ]);
  });
});
