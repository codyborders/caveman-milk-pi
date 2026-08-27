// Config tests cover schema validation, first-run defaults, and legacy migration through path-controlled public helpers.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadConfigAtPath,
  migrateLegacyConfigShape,
  validateConfigShape,
} from "../src/config.js";

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-test-"));
}

describe("config schema validation", () => {
  it("accepts the current schema", () => {
    expect(
      validateConfigShape({ schemaVersion: 1, mode: "full", showStatus: false }),
    ).toEqual({ schemaVersion: 1, mode: "full", showStatus: false });
  });

  it.each([
    [{ schemaVersion: 2, mode: "off", showStatus: true }, /unsupported schemaVersion/],
    [{ schemaVersion: 1, mode: "invalid", showStatus: true }, /invalid mode/],
    [{ schemaVersion: 1, mode: "off", showStatus: "yes" }, /showStatus must be a boolean/],
    [
      { schemaVersion: 1, mode: "off", showStatus: true, unexpected: true },
      /unknown field 'unexpected'/,
    ],
  ])("rejects invalid current config %#", (raw, message) => {
    expect(() => validateConfigShape(raw)).toThrow(message);
  });

  it("migrates a flat config and defaults showStatus", () => {
    expect(migrateLegacyConfigShape({ mode: "lite", enabled: true })).toEqual({
      schemaVersion: 1,
      mode: "lite",
      showStatus: true,
    });
  });

  it.each([
    [{ mode: "lite", enabled: "yes" }, /legacy enabled must be a boolean/],
    [{ mode: "lite", extra: true }, /unknown field 'extra'/],
  ])("rejects invalid legacy config %#", (raw, message) => {
    expect(() => migrateLegacyConfigShape(raw)).toThrow(message);
  });
});

describe("loadConfigAtPath", () => {
  it("creates and returns default config when the target is missing", () => {
    const targetPath = path.join(makeTempDirectory(), "config.json");

    const config = loadConfigAtPath(targetPath);

    expect(config).toEqual({ schemaVersion: 1, mode: "off", showStatus: true });
    expect(JSON.parse(fs.readFileSync(targetPath, "utf8"))).toEqual(config);
  });

  it("migrates a flat config in place", () => {
    const targetPath = path.join(makeTempDirectory(), "config.json");
    fs.writeFileSync(targetPath, '{"mode":"ultra","showStatus":false}\n', "utf8");

    const config = loadConfigAtPath(targetPath);

    expect(config).toEqual({ schemaVersion: 1, mode: "ultra", showStatus: false });
    expect(JSON.parse(fs.readFileSync(targetPath, "utf8"))).toEqual(config);
  });

  it("rejects malformed JSON with the config path", () => {
    const targetPath = path.join(makeTempDirectory(), "config.json");
    fs.writeFileSync(targetPath, "{broken", "utf8");

    expect(() => loadConfigAtPath(targetPath)).toThrow(
      `caveman-milk-pi config at ${targetPath} contains invalid JSON.`,
    );
  });

  it("moves the old filename when the target is absent", () => {
    const directory = makeTempDirectory();
    const targetPath = path.join(directory, "caveman-milk-pi.json");
    const legacyPath = path.join(directory, "pi-caveman.json");
    fs.writeFileSync(legacyPath, '{"mode":"full","showStatus":true}\n', "utf8");

    const config = loadConfigAtPath(targetPath, legacyPath);

    expect(config.mode).toBe("full");
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
  });
});
