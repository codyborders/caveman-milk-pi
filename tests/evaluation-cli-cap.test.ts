// CLI spending guard tests verify that explicit paid authorization also requires a maximum call count.

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("CLI spending guard", () => {
  it("rejects paid execution without a maximum call count", () => {
    const result = spawnSync("node", [path.resolve("scripts/evaluate.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "anthropic",
        CAVEMAN_EVAL_ALLOW_PAID: "1",
        ANTHROPIC_API_KEY: "test-key",
        CAVEMAN_EVAL_MODEL: "test-model",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAVEMAN_EVAL_MAX_PAID_CALLS");
  });
});
