// Multi-process migration tests verify that concurrent updates migrate one legacy file while preserving both field changes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runConfigChild, setupChildHarness } from "./child-harness.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-migration-"));
}

describe("multi-process legacy migration", () => {
  beforeAll(() => {
    setupChildHarness();
  }, 120_000);

  it("migrates once and preserves concurrent field changes", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    const legacyPath = path.join(directory, "pi-caveman.json");
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({ mode: "lite", enabled: false, showStatus: true }) + "\n",
      "utf8",
    );

    const [first, second] = await Promise.all([
      runConfigChild(configPath, "migA", { legacyConfigPath: legacyPath, holdMs: 100 }),
      runConfigChild(configPath, "migB", { legacyConfigPath: legacyPath, holdMs: 100 }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "wenyan",
      showStatus: false,
    });
    expect(fs.existsSync(legacyPath)).toBe(false);
  }, 30_000);
});
