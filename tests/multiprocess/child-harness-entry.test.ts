// The child harness must invoke the TypeScript compiler without a shell.
// node_modules/.bin shims are platform-specific (.cmd on Windows) and fail
// when spawned directly there. The portable form is process.execPath plus
// the compiler's plain JS entry inside the typescript package.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTscEntry } from "./child-harness.js";

describe("child harness compiler entry", () => {
  it("resolves a plain JS entry inside the typescript package", () => {
    const entry = resolveTscEntry();

    expect(entry.endsWith(".js")).toBe(true);
    expect(entry.includes(`${path.sep}typescript${path.sep}`)).toBe(true);
    expect(fs.existsSync(entry)).toBe(true);
  });

  it("runs the entry through process.execPath without a shell", () => {
    expect(() => {
      execFileSync(process.execPath, [resolveTscEntry(), "--version"], {
        stdio: "pipe",
      });
    }).not.toThrow();
  });
});
