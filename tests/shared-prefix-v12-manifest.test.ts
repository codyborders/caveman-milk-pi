// Hardening slice 4: a versioned fixture manifest pins the holdout bytes
// with SHA-256. Loading the fixtures verifies the hash and fails before any
// launch on mismatch. The manifest records the commit that froze the fixture.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

async function loadRunner() {
  try {
    return await import("../scripts/eval/shared-prefix-v12-runner.mjs");
  } catch {
    return null;
  }
}

function fixtureSha256(fixturePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(fixturePath), "utf8").digest("hex");
}

describe("shared-prefix v12 fixture manifest", () => {
  it("validates the pinned fixture hash and rejects drift before any launch", async () => {
    const runner = await loadRunner();
    const manifest = runner.loadSharedPrefixV12FixtureManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtureSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.freezeCommit).toBe("58456417feb1ee2987f6ed895af5adb520be62a7");

    // A tampered fixture must fail validation before any launch happens.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-manifest-"));
    const fixtureCopy = path.join(scratch, "shared-prefix-v12-fixtures.json");
    const manifestCopy = path.join(scratch, "shared-prefix-v12-fixture-manifest.json");
    fs.copyFileSync(
      path.resolve(import.meta.dirname, "../scripts/eval/shared-prefix-v12-fixtures.json"),
      fixtureCopy,
    );
    fs.copyFileSync(
      path.resolve(import.meta.dirname, "../scripts/eval/shared-prefix-v12-fixture-manifest.json"),
      manifestCopy,
    );
    expect(() => runner.loadSharedPrefixV12Fixtures(fixtureCopy, manifestCopy)).not.toThrow();
    const tampered = JSON.parse(fs.readFileSync(fixtureCopy, "utf8"));
    tampered.groups[0].tasks[0].prompt = "Tampered prompt bytes.";
    fs.writeFileSync(fixtureCopy, JSON.stringify(tampered, null, 2));
    expect(() => runner.loadSharedPrefixV12Fixtures(fixtureCopy, manifestCopy)).toThrow(
      /manifest.*mismatch|sha-256.*mismatch/i,
    );
  });

  it("pins the actual current fixture bytes", async () => {
    const runner = await loadRunner();
    const manifest = runner.loadSharedPrefixV12FixtureManifest();
    const fixturePath = path.resolve(
      import.meta.dirname,
      "../scripts/eval/shared-prefix-v12-fixtures.json",
    );
    expect(manifest.fixtureSha256).toBe(fixtureSha256(fixturePath));
  });
});
