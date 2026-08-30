// Hardening slice 5: an incremental atomic checkpoint preserves every
// support and measured launch. A hard interruption mid-run leaves the
// completed launches on disk, and a rerun with the same seed resumes them
// instead of paying for them again.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const driverPath = path.resolve(
  import.meta.dirname,
  "helpers/shared-prefix-v12-checkpoint-driver.mjs",
);

function runDriver(args) {
  return spawnSync(process.execPath, [driverPath, ...args], {
    encoding: "utf8",
    timeout: 120000,
  });
}

describe("shared-prefix v12 incremental checkpoint", () => {
  it("preserves launches across a hard crash and resumes them on rerun", () => {
    const checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ck-test-"));
    const checkpointPath = path.join(checkpointDir, "checkpoint.json");
    const checkpointArg = `--checkpoint=${checkpointPath}`;

    // Hard-interrupt at the third launch: two launches must survive on disk.
    const crashed = runDriver(["--crash-after=3", checkpointArg]);
    expect(crashed.status).toBe(70);
    const saved = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    expect(saved.schemaVersion).toBe(1);
    expect(Object.keys(saved.launches)).toHaveLength(2);

    // Rerun without the crash: the two recorded launches resume, the run
    // finishes, and the checkpoint ends with every launch recorded.
    const resumed = runDriver([checkpointArg]);
    expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0);
    const summary = JSON.parse(resumed.stdout);
    expect(summary.resumedLaunches).toBe(2);
    expect(summary.checkpointPath).toBe(checkpointPath);
    const final = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    // Warm+measured base (2 children-equivalent nodes: 1 child + 1 parent
    // each twice) plus 2 warm finalizers plus 2 reps x 2 arms measured.
    expect(Object.keys(final.launches).length).toBeGreaterThanOrEqual(8);
  });
});
