// Config-root resolution tests cover the explicit override and the
// per-platform conventions for linux, macOS, and windows.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getConfigPath,
  getConfigPaths,
  loadConfig,
  resolveConfigDirectory,
} from "../src/config.js";

// Simulated platforms must follow their own path semantics regardless of the
// host: win32 expects backslash joins and drive-letter resolution, while
// linux and darwin expect POSIX separators.
function platformExpectation(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-resolution-"));
}

describe("resolveConfigDirectory", () => {
  it("prefers the explicit config-root override on every platform", () => {
    for (const platform of ["linux", "darwin", "win32"] as const) {
      expect(
        resolveConfigDirectory({
          env: { CAVEMAN_MILK_CONFIG_DIR: "/opt/caveman" },
          platform,
          homedir: "/home/user",
        }),
      ).toBe(platformExpectation(platform).resolve("/opt/caveman"));
    }
  });

  it("normalizes the override with win32 semantics when simulating windows", () => {
    expect(
      resolveConfigDirectory({
        env: { CAVEMAN_MILK_CONFIG_DIR: "C:/Users/user/AppData/Roaming" },
        platform: "win32",
        homedir: "C:\\Users\\user",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Roaming");
  });

  it("honors XDG_CONFIG_HOME on linux and falls back to ~/.config", () => {
    expect(
      resolveConfigDirectory({
        env: { XDG_CONFIG_HOME: "/xdg/config" },
        platform: "linux",
        homedir: "/home/user",
      }),
    ).toBe("/xdg/config");
    expect(
      resolveConfigDirectory({ env: {}, platform: "linux", homedir: "/home/user" }),
    ).toBe("/home/user/.config");
  });

  it("uses the standard macOS Application Support location", () => {
    expect(
      resolveConfigDirectory({
        env: {},
        platform: "darwin",
        homedir: "/Users/user",
      }),
    ).toBe("/Users/user/Library/Application Support");
  });

  it("uses APPDATA on windows and falls back to the roaming profile", () => {
    expect(
      resolveConfigDirectory({
        env: { APPDATA: "C:\\Users\\user\\AppData\\Roaming" },
        platform: "win32",
        homedir: "C:\\Users\\user",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Roaming");
    expect(
      resolveConfigDirectory({
        env: {},
        platform: "win32",
        homedir: "C:\\Users\\user",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Roaming");
  });

  it("ignores a relative XDG_CONFIG_HOME value per the XDG specification", () => {
    expect(
      resolveConfigDirectory({
        env: { XDG_CONFIG_HOME: "relative/config" },
        platform: "linux",
        homedir: "/home/user",
      }),
    ).toBe("/home/user/.config");
  });
});

describe("getConfigPaths", () => {
  it("resolves the config-root override at call time", () => {
    const overrideDirectory = makeTempDirectory();
    process.env.CAVEMAN_MILK_CONFIG_DIR = overrideDirectory;

    expect(getConfigPath()).toBe(
      path.join(overrideDirectory, "caveman-milk-pi.json"),
    );

    const paths = getConfigPaths();
    expect(paths.configPath).toBe(getConfigPath());
    expect(paths.legacyConfigPaths).toContain(
      path.join(overrideDirectory, "pi-caveman.json"),
    );
  });

  it("keeps the prior ~/.config paths as migration candidates", () => {
    process.env.CAVEMAN_MILK_CONFIG_DIR = makeTempDirectory();

    const paths = getConfigPaths();
    expect(paths.legacyConfigPaths).toContain(
      path.join(os.homedir(), ".config", "caveman-milk-pi.json"),
    );
    expect(paths.legacyConfigPaths).toContain(
      path.join(os.homedir(), ".config", "pi-caveman.json"),
    );
  });

  it("loads through the override when set", () => {
    const overrideDirectory = makeTempDirectory();
    process.env.CAVEMAN_MILK_CONFIG_DIR = overrideDirectory;
    fs.writeFileSync(
      path.join(overrideDirectory, "caveman-milk-pi.json"),
      '{"schemaVersion":1,"mode":"full","showStatus":false}\n',
      "utf8",
    );

    expect(loadConfig()).toEqual({
      schemaVersion: 1,
      mode: "full",
      showStatus: false,
    });
  });
});
