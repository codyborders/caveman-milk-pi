// Git commit discovery: without CAVEMAN_EVAL_COMMIT or an injected execGit,
// the evaluator must discover the run commit through a real Git invocation.
// This exercises the ESM default path in a plain node process, where a
// CommonJS require() call would throw.

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/evaluate.mjs");

describe("git commit discovery", () => {
  it("discovers the checkout commit in a plain node process without CAVEMAN_EVAL_COMMIT", () => {
    const result = spawnSync("node", [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "anthropic",
        CAVEMAN_EVAL_ALLOW_PAID: "1",
        ANTHROPIC_API_KEY: "test-key",
        CAVEMAN_EVAL_MODEL: "test-model",
        CAVEMAN_EVAL_MODES: "off,full",
        CAVEMAN_EVAL_CATEGORIES: "technical-explanation",
        CAVEMAN_EVAL_REPETITIONS: "3",
        CAVEMAN_EVAL_SEED: "0x1",
        CAVEMAN_EVAL_MAX_PAID_CALLS: "10",
        CAVEMAN_EVAL_ENDPOINT: "http://127.0.0.1:9/v1/messages",
        CAVEMAN_EVAL_MAX_ATTEMPTS: "1",
        CAVEMAN_EVAL_TIMEOUT_MS: "500",
        CAVEMAN_EVAL_COMMIT: "",
      },
    });
    // A CommonJS require() in ESM scope must not break discovery.
    expect(result.stderr).not.toContain("require is not defined");
    // Discovery succeeded: the run advanced past commit collection into the
    // first provider call, which fails against the unreachable endpoint.
    expect(result.stderr).toContain("evaluation aborted");
    expect(result.stderr).not.toContain("Evaluation requires a Git commit SHA");
  }, 30_000);
});
