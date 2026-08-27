// Multi-process first-run creation: two processes updating a missing config
// simultaneously must produce one deterministic file that keeps both changes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runConfigChild, setupChildHarness } from "./child-harness.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-creation-"));
}

describe("multi-process first-run creation", () => {
  beforeAll(() => {
    setupChildHarness();
  }, 120_000);

  it("simultaneous first-run creation stays deterministic and keeps both changes", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");

    const [first, second] = await Promise.all([
      runConfigChild(configPath, "createA", { holdMs: 150 }),
      runConfigChild(configPath, "createB", { holdMs: 150 }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "ultra",
      showStatus: false,
    });
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  }, 30_000);
});
