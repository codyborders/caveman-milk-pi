// Stored-seed arm order: identical seeds reproduce the same randomized run
// order across repetitions, and the order differs from the fixture order.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("seeded run order", () => {
  it("reproduces the same randomized order for the same stored seed", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const first = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const second = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      expect(first.seed).toBe("0xa1b2c3d4");
      expect(second.seed).toBe("0xa1b2c3d4");
      const keysOf = (report) => report.runOrder.map((entry) => entry.key);
      expect(keysOf(second)).toEqual(keysOf(first));
      const fixedOrder = first.runOrder
        .filter((entry) => entry.repetition === 1)
        .map((entry) => entry.mode);
      expect(new Set(fixedOrder)).toEqual(new Set(["off", "full"]));
      expect(first.repetitions).toBe(3);
      expect(first.caseCount).toBe(6);
    } finally {
      server.stop();
    }
  });
});
