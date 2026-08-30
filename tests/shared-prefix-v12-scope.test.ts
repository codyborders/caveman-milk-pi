// Scope guard for the shared-prefix-v12 evaluation branch. The branch is
// evaluation-only: runtime entry points, runtime sources, and the reviewed
// skill artifact must stay byte-identical to the clean main base commit.
// Any committed or working-tree change under those paths fails this test.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const BASE_COMMIT = "abbf4dd3bd80f41ed0bc0021289d125ae283876c";
const RUNTIME_PATHS = ["index.ts", "src", "skill"];

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

describe("shared-prefix-v12 scope", () => {
  it("resolves the pinned base commit inside this checkout", () => {
    expect(() => git(["cat-file", "-e", `${BASE_COMMIT}^{commit}`])).not.toThrow();
  });

  it("keeps runtime files identical to the base commit with no working-tree edits", () => {
    const committed = git([
      "diff",
      "--name-only",
      BASE_COMMIT,
      "HEAD",
      "--",
      ...RUNTIME_PATHS,
    ]).trim();
    expect(committed, `committed runtime changes: ${committed}`).toBe("");

    const workingTree = git(["status", "--porcelain", "--", ...RUNTIME_PATHS]).trim();
    expect(workingTree, `working-tree runtime changes: ${workingTree}`).toBe("");
  });

  it("still ships the runtime entry point from the base commit bytes", () => {
    const indexBytes = fs.readFileSync(path.join(root, "index.ts"));
    const baseBytes = Buffer.from(git(["show", `${BASE_COMMIT}:index.ts`]), "utf8");
    expect(indexBytes.equals(baseBytes)).toBe(true);
  });
});
