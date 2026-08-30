// CLI gate validation: CAVEMAN_EVAL_GATE must name a cost or release gate
// before any paid work starts, matching the API-side gate validation.

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("CLI gate validation", () => {
  it("rejects an unknown gate designation with the allowed values", () => {
    const result = spawnSync("node", [path.resolve("scripts/evaluate.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "anthropic",
        CAVEMAN_EVAL_ALLOW_PAID: "1",
        CAVEMAN_EVAL_MAX_PAID_CALLS: "400",
        CAVEMAN_EVAL_MODEL: "test-model",
        CAVEMAN_EVAL_SEED: "0xa1b2c3d4",
        CAVEMAN_EVAL_GATE: "budget",
        ANTHROPIC_API_KEY: "test-key",
        CAVEMAN_EVAL_ENDPOINT: "http://127.0.0.1:9/v1/messages",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAVEMAN_EVAL_GATE must be 'cost' or 'release'");
  });
});
