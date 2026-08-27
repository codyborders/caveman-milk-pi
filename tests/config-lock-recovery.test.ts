// Stale-lock recovery: when a live owner replaces the stale lock between
// validation and the quarantine rename, recovery must detect the stolen
// bytes and restore the live lock instead of deleting it.
//
// The race window is forced by wrapping fs.renameSync: the live replacement
// is written immediately before the quarantine rename executes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateConfigAtPath } from "../src/config.js";
import type { CavemanConfig } from "../src/types.js";

const raceState = vi.hoisted(() => ({
  lockPath: null as string | null,
  replacementBytes: null as string | null,
  replacementTime: null as Date | null,
  renames: [] as Array<{ from: string; to: string }>,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const pathModule = await import("node:path");
  return {
    ...actual,
    renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      const fromPath = String(from);
      const toPath = String(to);
      if (
        raceState.lockPath !== null &&
        fromPath === raceState.lockPath &&
        pathModule.basename(toPath).includes(".stale.") &&
        raceState.replacementBytes !== null &&
        raceState.replacementTime !== null
      ) {
        // A live owner replaces the validated bytes just before the rename.
        actual.writeFileSync(fromPath, raceState.replacementBytes, "utf8");
        actual.utimesSync(fromPath, raceState.replacementTime, raceState.replacementTime);
        raceState.replacementBytes = null;
      }
      raceState.renames.push({ from: fromPath, to: toPath });
      return actual.renameSync(from, to);
    },
  };
});

const INITIAL: CavemanConfig = { schemaVersion: 1, mode: "off", showStatus: true };

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-recovery-"));
}

afterEach(() => {
  raceState.lockPath = null;
  raceState.replacementBytes = null;
  raceState.replacementTime = null;
  raceState.renames = [];
});

describe("stale-lock recovery", () => {
  it("restores a live lock stolen between validation and quarantine", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;

    // Stale lock: crashed owner, old mtime. The live replacement has equal
    // byte length, so the recovery double-stat cannot distinguish them.
    const staleTime = new Date(Date.now() - 60_000);
    const staleOwner =
      JSON.stringify({
        token: `crashed:${"a".repeat(32)}`,
        pid: 999999,
        createdMs: Date.now() - 60_000,
      }) + "\n";
    const liveOwner =
      JSON.stringify({
        token: `live:${"b".repeat(35)}`,
        pid: 888888,
        createdMs: Date.now(),
      }) + "\n";
    if (staleOwner.length !== liveOwner.length) {
      throw new Error("test fixture owner blobs must have equal length");
    }
    fs.writeFileSync(lockPath, staleOwner, "utf8");
    fs.utimesSync(lockPath, staleTime, staleTime);

    raceState.lockPath = lockPath;
    raceState.replacementBytes = liveOwner;
    raceState.replacementTime = staleTime;

    const updated = await updateConfigAtPath(
      configPath,
      (config) => ({ ...config, mode: "full" }),
      { staleAfterMs: 5_000, maxWaitMs: 3_000, pollIntervalMs: 5 },
    );

    expect(updated.mode).toBe("full");
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "full",
      showStatus: true,
    });

    // The stolen live bytes were quarantined and then restored to the lock
    // path rather than deleted.
    const quarantineRenames = raceState.renames.filter((entry) =>
      path.basename(entry.to).includes(".stale."),
    );
    expect(quarantineRenames.length).toBeGreaterThanOrEqual(1);
    const restoreRenames = raceState.renames.filter(
      (entry) => entry.to === lockPath && path.basename(entry.from).includes(".stale."),
    );
    expect(restoreRenames.length).toBeGreaterThanOrEqual(1);

    // No quarantine leftovers remain after the update completes.
    expect(fs.readdirSync(directory).filter((name) => name.includes(".stale."))).toEqual([]);
  });
});
