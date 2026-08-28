// Checkpoint seed tests verify that resumable runs use an explicit reproducible arm-order seed.

import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

describe("checkpoint seed guard", () => {
  it("rejects a checkpoint without an explicit seed before requests", async () => {
    const options = baseOptions("https://example.invalid/messages", {
      checkpointPath: path.join(os.tmpdir(), "caveman-seed-guard.json"),
      seed: undefined,
      fetchImpl: async () => {
        throw new Error("request must not run");
      },
    });

    await expect(evaluate.runProviderEvaluation(options)).rejects.toThrow(/explicit seed/);
  });
});
