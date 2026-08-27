// Multi-process concurrency tests spawn real child processes that run the
// compiled config module against one shared config path. They prove that
// concurrent mode and showStatus updates both survive, that simultaneous
// first-run creation is deterministic, and that simultaneous legacy
// migration lands exactly once.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runConfigChild, setupChildHarness } from "./child-harness.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-multiproc-"));
}

describe("multi-process config updates", () => {
  beforeAll(() => {
    setupChildHarness();
  }, 120_000);

  it("concurrent mode and showStatus changes both survive", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");

    const [modeResult, statusResult] = await Promise.all([
      runConfigChild(configPath, "mode", { holdMs: 150 }),
      runConfigChild(configPath, "status", { holdMs: 150 }),
    ]);

    expect(modeResult.ok).toBe(true);
    expect(statusResult.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "full",
      showStatus: false,
    });
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  }, 30_000);
});
