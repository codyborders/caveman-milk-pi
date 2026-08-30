import { describe, expect, it } from "vitest";
import { buildSelectiveFinalSystemPrompt } from "../scripts/eval/pi-eval-final-response.js";
import { FINAL_RESPONSE_CONTRACT_V11 } from "../src/final-response-contract.js";

describe("selective-final evaluation extension", () => {
  it("injects v11 only for the candidate finalizer", () => {
    expect(buildSelectiveFinalSystemPrompt("base", "off")).toBe("base");
    const candidate = buildSelectiveFinalSystemPrompt("base", "selective-final-v11");
    expect(candidate).toBe(`base${FINAL_RESPONSE_CONTRACT_V11.text}`);
    expect(candidate.match(/prompt contract v11/g)).toHaveLength(1);
  });
});
