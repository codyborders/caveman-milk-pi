// Hardening slice 7: CLI environment controls. A fully configured paid run
// with a dead Pi binary must terminate promptly (every launch fails fast and
// is preserved as an invalid attempt; nothing may pin the event loop). The
// judge path requires an explicit judge model before any launch.

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(import.meta.dirname, "../scripts/eval/shared-prefix-v12-cli.mjs");

function runCli(environment, timeoutMs = 45000) {
  return spawnSync(process.execPath, [cliPath], {
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: timeoutMs,
  });
}

function paidEnv(extra) {
  return {
    CAVEMAN_EVAL_PROVIDER: "pi",
    CAVEMAN_EVAL_ALLOW_PAID: "1",
    CAVEMAN_EVAL_MAX_PAID_CALLS: "5000",
    CAVEMAN_EVAL_MODEL: "test-model",
    CAVEMAN_EVAL_SEED: "0x1",
    CAVEMAN_EVAL_PI_BIN: "/nonexistent/pi",
    ...extra,
  };
}

describe("shared-prefix v12 CLI environment controls", () => {
  it("terminates a fully failing paid run promptly and preserves invalid attempts", () => {
    const result = runCli(paidEnv({}));
    expect(result.status, `signal=${result.signal} stderr=${result.stderr}`).not.toBeNull();
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.attempts.length).toBeGreaterThan(0);
    expect(report.attempts.every((attempt) => attempt.error !== null)).toBe(true);
    expect(report.defaultMode).toBe("off");
    expect(report.passed).toBe(false);
  });

  it("requires an explicit judge model before any launch when the judge is enabled", () => {
    const result = runCli(paidEnv({ CAVEMAN_EVAL_JUDGE: "1" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/judge model/i);
  });
});
