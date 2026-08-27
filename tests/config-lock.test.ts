// Lock and update tests cover the concurrent-safe updateConfig operation:
// short-lived same-directory lock, reload under lock, single-field mutation,
// atomic 0600 save, and release of only the updater's own lock.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { updateConfigAtPath } from "../src/config.js";
import type { CavemanConfig } from "../src/types.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-lock-"));
}

const DEFAULT_INITIAL: CavemanConfig = {
  schemaVersion: 1,
  mode: "off",
  showStatus: true,
};

describe("updateConfigAtPath", () => {
  it("applies a single-field change under the lock and cleans the lock up", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");

    const updated = await updateConfigAtPath(configPath, (config) => ({
      ...config,
      mode: "full",
    }));

    expect(updated).toEqual({ schemaVersion: 1, mode: "full", showStatus: true });
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(updated);
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  });

  it("rejects a mutator that changes multiple fields and leaves the file unchanged", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    const original = JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n";
    fs.writeFileSync(configPath, original, "utf8");

    await expect(
      updateConfigAtPath(configPath, (config) => ({
        ...config,
        mode: "full",
        showStatus: false,
      })),
    ).rejects.toThrow(/changed multiple fields/);

    expect(fs.readFileSync(configPath, "utf8")).toBe(original);
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  });

  it("accepts a no-op mutator and leaves the file untouched", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    // Non-canonical single-line formatting: any rewrite would normalize it.
    const original = '{"schemaVersion":1,"mode":"off","showStatus":true}\n';
    fs.writeFileSync(configPath, original, "utf8");

    const returned = await updateConfigAtPath(configPath, (config) => config);

    expect(returned).toEqual({ schemaVersion: 1, mode: "off", showStatus: true });
    expect(fs.readFileSync(configPath, "utf8")).toBe(original);
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  });

  it("fails clearly while another live lock is held and never deletes it", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: "other-process:abc", pid: 424242, createdMs: Date.now() }) + "\n",
      "utf8",
    );

    await expect(
      updateConfigAtPath(configPath, (config) => ({ ...config, mode: "full" }), {
        maxWaitMs: 60,
        staleAfterMs: 60_000,
        pollIntervalMs: 10,
      }),
    ).rejects.toThrow(/was not acquired within 60ms/);

    expect(fs.existsSync(lockPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(DEFAULT_INITIAL);
  });

  it("recovers a stale lock left by a crashed writer and completes the update", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: "crashed:old", pid: 999999, createdMs: Date.now() - 60_000 }) + "\n",
      "utf8",
    );
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    const updated = await updateConfigAtPath(
      configPath,
      (config) => ({ ...config, showStatus: false }),
      { staleAfterMs: 5_000, maxWaitMs: 2_000, pollIntervalMs: 10 },
    );

    expect(updated).toEqual({ schemaVersion: 1, mode: "off", showStatus: false });
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(updated);
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  });

  it("serializes waiters after stale recovery so concurrent updates both survive", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: "crashed:old", pid: 999999, createdMs: Date.now() - 60_000 }) + "\n",
      "utf8",
    );
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    const [modeResult, statusResult] = await Promise.all([
      updateConfigAtPath(
        configPath,
        (config) => ({ ...config, mode: "full" }),
        { staleAfterMs: 5, maxWaitMs: 5_000, pollIntervalMs: 5 },
      ),
      updateConfigAtPath(
        configPath,
        (config) => ({ ...config, showStatus: false }),
        { staleAfterMs: 5, maxWaitMs: 5_000, pollIntervalMs: 5 },
      ),
    ]);

    expect(modeResult.mode).toBe("full");
    expect(statusResult.showStatus).toBe(false);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "full",
      showStatus: false,
    });
    expect(fs.readdirSync(directory)).toEqual(["caveman-milk-pi.json"]);
  });

  it("never releases a lock whose ownership token is no longer its own", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;

    await updateConfigAtPath(configPath, (config) => {
      // Simulate another owner taking over mid-update (for example after
      // stale recovery of our lock): the file now carries a foreign token.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ token: "other:deadbeef", pid: 1, createdMs: Date.now() }) + "\n",
        "utf8",
      );
      return { ...config, mode: "lite" };
    });

    expect(fs.existsSync(lockPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "lite",
      showStatus: true,
    });
    fs.unlinkSync(lockPath);
  });

  it("propagates an unexpected release failure after a successful save", async () => {
    const directory = makeTempDirectory();
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;

    // Replace our lock file with an unreadable directory entry mid-update:
    // release cannot prove ownership and must fail loudly, not delete it.
    await expect(
      updateConfigAtPath(configPath, (config) => {
        fs.rmSync(lockPath, { force: true });
        fs.mkdirSync(lockPath);
        return { ...config, mode: "ultra" };
      }),
    ).rejects.toThrow(/EISDIR|EPERM|EACCES/);

    expect(fs.statSync(lockPath).isDirectory()).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
      schemaVersion: 1,
      mode: "ultra",
      showStatus: true,
    });
  });
});
