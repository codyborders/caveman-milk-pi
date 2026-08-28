// Checkpoint identity tests prevent reuse after model or prompt configuration changes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer, fixtures } from "./helpers/mock-provider-server.js";

describe("checkpoint run identity", () => {
  it("rejects completed calls from another model configuration", async () => {
    const server = createMockServer();
    await server.start();
    const checkpointPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "caveman-checkpoint-identity-")),
      "checkpoint.json",
    );
    try {
      await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { checkpointPath }),
      );
      expect(server.requestCount()).toBe(6);

      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), {
            checkpointPath,
            model: "different-model",
          }),
        ),
      ).rejects.toThrow(/belongs to run/);
      expect(server.requestCount()).toBe(6);

      // A prompt contract change must equally invalidate reuse: the runtime
      // prompt hash in the run identity no longer matches the checkpoint.
      const changedFixtures = {
        ...fixtures,
        runtimePrompts: {
          ...fixtures.runtimePrompts,
          full: fixtures.runtimePrompts.full + "\nAMENDED CONTRACT RULE\n",
        },
      };
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, fixtures: changedFixtures }),
        ),
      ).rejects.toThrow(/belongs to run/);
      expect(server.requestCount()).toBe(6);

      // A metadata-only contract change must also invalidate reuse: the run
      // identity hashes the entire prompt contract, not just runtime text.
      const metadataOnlyChange = {
        ...fixtures,
        promptContract: {
          ...fixtures.promptContract,
          tokenAccounting: {
            ...fixtures.promptContract.tokenAccounting,
            status: "measured",
          },
        },
      };
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, fixtures: metadataOnlyChange }),
        ),
      ).rejects.toThrow(/belongs to run/);
      expect(server.requestCount()).toBe(6);
    } finally {
      server.stop();
    }
  });
});
