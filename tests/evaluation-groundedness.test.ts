import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

describe("groundedness validation", () => {
  it("accepts clarification when required facts are absent", () => {
    const outcome = runValidators(
      "I need the latency_ms value and workload details before comparing these options.",
      [{ id: "groundedness", expected: "clarification" }],
      { taskPrompt: "Compare Option A and Option B; no option facts supplied." },
    );
    expect(outcome.passed).toBe(true);
  });

  it("rejects unsupported qualitative comparisons without numbers", () => {
    const outcome = runValidators(
      "Option A is better, but please provide more facts.",
      [{ id: "groundedness", expected: "clarification" }],
      { taskPrompt: "Compare Option A and Option B; no option facts supplied." },
    );
    expect(outcome.passed).toBe(false);
  });
});
