// Judge spending tests verify that the paid-call cap includes both response arms and blinded judge calls.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

describe("judge spending cap", () => {
  it("rejects a cap that covers response arms but not judge calls", async () => {
    const options = baseOptions("https://example.invalid/messages", {
      judge: true,
      maxPaidCalls: 6,
      fetchImpl: async () => {
        throw new Error("request must not run");
      },
    });

    await expect(evaluate.runProviderEvaluation(options)).rejects.toThrow(
      /Planned paid calls \(9\) exceed the configured cap \(6\)/,
    );
  });
});
