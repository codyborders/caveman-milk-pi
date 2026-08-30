// Offline structural report and CLI integration for shared-prefix v12. The
// CLI defaults to the offline report and never launches a process for it.
// Paid-path gating lives in its own slice. No paid model trial ever runs in
// these tests.

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(import.meta.dirname, "../scripts/eval/shared-prefix-v12-cli.mjs");

function runCli(environment) {
  return spawnSync(process.execPath, [cliPath], {
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 60000,
  });
}

describe("shared-prefix v12 offline report and CLI", () => {
  it("emits a structural offline report with groups, arms, and planning shape", () => {
    const result = runCli({});
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.schemaVersion).toBe("shared-prefix-v12-report/1");
    expect(report.provider).toBe("offline");
    expect(report.arms).toEqual(["normal-off", "shared-prefix-off", "shared-prefix-candidate"]);
    expect(report.defaultMode).toBe("off");
    expect(report.passed).toBe(false);
    expect(report.claims).toEqual([]);
    expect(report.tokenAccounting.status).toBe("not-run");
    const groups = Object.fromEntries(report.groups.map((group) => [group.id, group]));
    expect(groups["eligible-prose"].taskCount).toBe(7);
    expect(groups["protected-content"].taskCount).toBe(7);
    expect(report.planning.finalizerLaunchesPerRepetition).toBe(14);
    expect(report.planning.baseLaunches).toBeGreaterThan(14);
    expect(report.candidateContractChars).toBeGreaterThan(0);
    expect(report.candidateContractSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.note).toContain("no process launches");
  });

  it("gates the paid Pi path behind authorization, a cap, and a model", () => {
    const unknown = runCli({ CAVEMAN_EVAL_PROVIDER: "openai" });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/unsupported provider/i);

    const unauthorized = runCli({ CAVEMAN_EVAL_PROVIDER: "pi" });
    expect(unauthorized.status).toBe(1);
    expect(unauthorized.stderr).toMatch(/authorization/i);

    const noCap = runCli({ CAVEMAN_EVAL_PROVIDER: "pi", CAVEMAN_EVAL_ALLOW_PAID: "1" });
    expect(noCap.status).toBe(1);
    expect(noCap.stderr).toMatch(/cap/i);

    const noModel = runCli({
      CAVEMAN_EVAL_PROVIDER: "pi",
      CAVEMAN_EVAL_ALLOW_PAID: "1",
      CAVEMAN_EVAL_MAX_PAID_CALLS: "500",
    });
    expect(noModel.status).toBe(1);
    expect(noModel.stderr).toMatch(/model/i);
  });
});
