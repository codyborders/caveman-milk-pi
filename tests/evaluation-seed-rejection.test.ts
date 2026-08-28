// Supplied seeds must be valid hexadecimal. A malformed seed must reject
// instead of silently falling back to a random seed, because the run record
// and checkpoint identity would then not match the requested seed.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("seed validation", () => {
  it.each(["not-hex", "12zz", "", "0x", "-1"])(
    "rejects malformed supplied seed %s before any paid request",
    async (seed) => {
      const server = createMockServer();
      await server.start();
      try {
        await expect(
          evaluate.runProviderEvaluation(baseOptions(server.url(), { seed })),
        ).rejects.toThrow(/CAVEMAN_EVAL_SEED.*hexadecimal/);
        expect(server.requestCount()).toBe(0);
      } finally {
        server.stop();
      }
    },
  );
});
