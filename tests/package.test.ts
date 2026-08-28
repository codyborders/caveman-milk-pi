import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as {
  name: string;
  version: string;
  repository: { url: string };
  homepage: string;
  bugs: { url: string };
  author: string;
  files: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const credits = fs.readFileSync(path.join(root, "CREDITS.md"), "utf8");
const gitAttributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");

describe("fork release metadata", () => {
  it("packs only runtime material", () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-package-test-"));
    try {
      const packed = spawnSync("npm", ["pack", "--silent", "--pack-destination", temporaryDirectory], {
        cwd: root,
        encoding: "utf8",
      });
      expect(packed.status, `${packed.stdout}\n${packed.stderr}`).toBe(0);
      const tarball = fs.readdirSync(temporaryDirectory).find((name) => name.endsWith(".tgz"));
      expect(tarball).toBeDefined();
      const listing = spawnSync("tar", ["-tzf", path.join(temporaryDirectory, tarball ?? "")], {
        encoding: "utf8",
      });
      expect(listing.status, `${listing.stdout}\n${listing.stderr}`).toBe(0);
      const entries = listing.stdout.trim().split(/\r?\n/).map((entry) => entry.replace(/^package\//, ""));
      const expected = [
        "CREDITS.md",
        "LICENSE",
        "README.md",
        "index.ts",
        "package.json",
        "skill/SKILL.md",
        "src/command.ts",
        "src/config.ts",
        "src/injection.ts",
        "src/prompt-contract.json",
        "src/types.ts",
      ];
      expect(new Set(entries)).toEqual(new Set(expected));
      expect(entries).not.toEqual(expect.arrayContaining([
        "CHANGELOG.md",
        "evaluation/results/benchmark-regression-v2.json",
        "evaluation/results/benchmark-regression-v2-rescored.json",
        "scripts/evaluate.mjs",
        "scripts/evaluation-fixtures-fresh-v1.json",
      ]));
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("identifies fork package and release metadata", () => {
    expect(packageJson.name).toBe("@codyborders/caveman-milk-pi");
    expect(packageJson.version).toBe("0.4.0-beta.1");
    expect(packageJson.repository.url).toBe(
      "git+https://github.com/codyborders/caveman-milk-pi.git",
    );
    expect(packageJson.homepage).toBe("https://github.com/codyborders/caveman-milk-pi");
    expect(packageJson.bugs.url).toBe(
      "https://github.com/codyborders/caveman-milk-pi/issues",
    );
    expect(packageJson.author).toBe("codyborders");
    expect(packageJson.dependencies?.typescript).toBeUndefined();
    expect(packageJson.devDependencies?.typescript).toBe("^6.0.2");
    expect(packageJson.files).not.toContain("scripts/sync-skill.sh");
    expect(packageJson.files).not.toContain("scripts/evaluate.mjs");
    expect(packageJson.files).not.toContain("scripts/evaluation-fixtures-fresh-v1.json");
    expect(packageJson.files).not.toContain("evaluation/fixture-manifest.json");
    expect(packageJson.files).not.toContain("evaluation/source-fixtures/benchmark-regression-v2.json");
    expect(packageJson.files).not.toContain("evaluation/results/benchmark-regression-v2.json");
    expect(packageJson.files).not.toContain("evaluation/rescore-manifest.json");
    expect(fs.existsSync(path.join(root, "scripts/smoke-packed.mjs"))).toBe(true);
    expect(readme).toContain("pi install git:github.com/codyborders/caveman-milk-pi");
    expect(changelog).toContain("## 0.4.0-beta.1 - Unreleased");
    expect(changelog).not.toContain("## Unreleased");
    expect(credits).toContain("@codyborders/caveman-milk-pi");
    expect(gitAttributes).toContain("evaluation/results/benchmark-regression-v2-rescored.json -text");
    expect(gitAttributes).toContain("evaluation/results/benchmark-regression-v2-rescored.md -text");
  });
});
