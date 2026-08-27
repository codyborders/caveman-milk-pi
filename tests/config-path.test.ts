import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { saveConfigAtPath } from "../src/config.js";
import type { CavemanConfig } from "../src/types.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-test-"));
}

describe("saveConfigAtPath", () => {
  it("two consecutive saves leave the latest valid config at targetPath and no temp files", () => {
    const dir = makeTempDir();
    const target = path.join(dir, "config.json");
    const configA: CavemanConfig = {
      schemaVersion: 1,
      mode: "off",
      showStatus: true,
    };
    const configB: CavemanConfig = {
      schemaVersion: 1,
      mode: "full",
      showStatus: false,
    };

    saveConfigAtPath(configA, target);
    saveConfigAtPath(configB, target);

    const raw = fs.readFileSync(target, "utf8");
    const parsed = JSON.parse(raw) as CavemanConfig;
    expect(parsed).toEqual(configB);

    const entries = fs.readdirSync(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe("config.json");
  });

  it("rejects relative target paths", () => {
    const config: CavemanConfig = {
      schemaVersion: 1,
      mode: "off",
      showStatus: true,
    };

    expect(() => saveConfigAtPath(config, "config.json")).toThrow(/must be absolute/);
  });

  it("removes its temporary file when rename fails", () => {
    const directory = makeTempDir();
    const target = path.join(directory, "config.json");
    fs.mkdirSync(target);
    const config: CavemanConfig = {
      schemaVersion: 1,
      mode: "off",
      showStatus: true,
    };

    expect(() => saveConfigAtPath(config, target)).toThrow();
    expect(fs.readdirSync(directory)).toEqual(["config.json"]);
  });
});
