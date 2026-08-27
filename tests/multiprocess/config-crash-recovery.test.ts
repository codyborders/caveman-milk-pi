// Crash recovery tests verify that another process can recover a stale lock left by a terminated writer.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runConfigChild, setupChildHarness } from "./child-harness.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-crash-"));
}

describe("multi-process crash recovery", () => {
  beforeAll(() => {
    setupChildHarness();
  }, 120_000);

  it("recovers the stale lock and applies the next update", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ schemaVersion: 1, mode: "off", showStatus: true }) + "\n",
      "utf8",
    );

    const crashed = await runConfigChild(configPath, "crash", { holdMs: 20 });
    expect(crashed.crashed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const recovered = await runConfigChild(configPath, "mode", {
      lockOptions: { staleAfterMs: 20, maxWaitMs: 2_000, pollIntervalMs: 10 },
    });

    expect(recovered.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "full",
      showStatus: true,
    });
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  }, 30_000);
});
