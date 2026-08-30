// Deterministic v10 development checks: the CLI must verify the 25 percent
// reduction against the preserved v9 baseline, coverage terms, unchanged mode
// rules, the empty off arm, and the locked fresh-v2 regression fixture
// without any provider call.

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts", "eval", "prompt-contract-v10-dev-check.mjs");

function runCheck() {
  return execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
}

describe("prompt contract v10 development check", () => {
  it("exits zero and reports per-mode reduction plus the fresh-v2 regression", () => {
    const output = runCheck();
    expect(output).toContain("prompt contract v10 development check");
    for (const mode of ["lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-ultra"]) {
      expect(output).toMatch(new RegExp(`mode ${mode}: \\d+ -> \\d+ tokens \\([-\\d.]+%\\)`));
    }
    expect(output).toContain("off: 0 characters (zero-byte)");
    expect(output).toContain("fresh-v2 regression: fixture hash verified");
    expect(output).toContain("all v10 development checks passed");
  });
});
