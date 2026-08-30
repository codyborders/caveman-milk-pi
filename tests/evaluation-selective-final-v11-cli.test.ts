import { describe, expect, it } from "vitest";
import { phaseEnvironment, runPhase } from "../scripts/eval/selective-final-v11-cli.mjs";

describe("selective-final evaluation CLI", () => {
  it("declares matched arms, alternating order, and controlled cache phases", () => {
    const cold = phaseEnvironment("cold", {});
    expect(cold).toMatchObject({
      CAVEMAN_EVAL_FIXTURE_SET: "fresh-v4",
      CAVEMAN_EVAL_MODES: "off,selective-final-v11",
      CAVEMAN_EVAL_REPETITIONS: "5",
      CAVEMAN_EVAL_PAIR_ORDER: "alternating",
      CAVEMAN_EVAL_CACHE_CONDITION: "cold",
      CAVEMAN_EVAL_CACHE_PROMPT_STRATEGY: "unique-arm",
      CAVEMAN_EVAL_JUDGE: "1",
    });
    expect(phaseEnvironment("warm", {}).CAVEMAN_EVAL_CACHE_PROMPT_STRATEGY).toBe("shared");
  });

  it("rejects paid execution without explicit authorization and cap", async () => {
    await expect(runPhase("cold", { env: {} })).rejects.toThrow(
      "CAVEMAN_EVAL_ALLOW_PAID=1",
    );
    await expect(
      runPhase("cold", { env: { CAVEMAN_EVAL_ALLOW_PAID: "1" } }),
    ).rejects.toThrow("CAVEMAN_EVAL_MAX_PAID_CALLS");
  });
});
