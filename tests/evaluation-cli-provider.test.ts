// CLI provider validation: unsupported provider names exit non-zero before any
// work, listing the supported providers.

import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("CLI provider validation", () => {
  it("rejects an unsupported provider name with the supported list", () => {
    const result = spawnSync("node", [path.resolve("scripts/evaluate.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "banana",
        CAVEMAN_EVAL_ALLOW_PAID: "1",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported CAVEMAN_EVAL_PROVIDER 'banana'");
    expect(result.stderr).toContain("anthropic, pi");
  });
});
