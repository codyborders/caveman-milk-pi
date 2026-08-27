// Off-baseline selection guard: active modes without the off arm must fail
// before any paid request.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("off baseline selection guard", () => {
  it("rejects active modes without off before any request", async () => {
    const server = createMockServer();
    await server.start();
    try {
      await expect(
        evaluate.runProviderEvaluation(baseOptions(server.url(), { modes: ["lite", "full"] })),
      ).rejects.toThrow(/off baseline arm/);
      expect(server.requestCount()).toBe(0);
    } finally {
      server.stop();
    }
  });
});
