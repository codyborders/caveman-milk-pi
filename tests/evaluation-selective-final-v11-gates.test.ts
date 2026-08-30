import { describe, expect, it } from "vitest";
import { evaluateSelectiveFinalGates } from "../scripts/eval/selective-final-v11.mjs";
describe("selective-final gates", () => {
  it("requires every predeclared conjunctive gate", () => {
    expect(evaluateSelectiveFinalGates({ tokenUpper95: -1, latencyUpper95: -1, nestedSuccessLower95: 0, nestedCandidateSuccessRate: 1, preservationLosses: 0 })).toMatchObject({ passed: true, defaultMode: "selective-final-v11" });
    expect(evaluateSelectiveFinalGates({ tokenUpper95: 1, latencyUpper95: -1, nestedSuccessLower95: 0, nestedCandidateSuccessRate: 1, preservationLosses: 0 }).passed).toBe(false);
    expect(evaluateSelectiveFinalGates({ tokenUpper95: -1, latencyUpper95: -1, nestedSuccessLower95: 0, nestedCandidateSuccessRate: 0.9, preservationLosses: 0 }).passed).toBe(false);
  });
});
