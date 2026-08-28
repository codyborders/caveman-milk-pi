import fs from "node:fs";
import path from "node:path";
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
};

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const credits = fs.readFileSync(path.join(root, "CREDITS.md"), "utf8");
const gitAttributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");

describe("fork release metadata", () => {
  it("identifies fork package, GitHub install path, packed recovery script, and release", () => {
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
    expect(packageJson.files).toContain("scripts/sync-skill.sh");
    expect(packageJson.files).toContain("scripts/evaluation-fixtures-regression-v2.json");
    expect(packageJson.files).toContain("scripts/evaluation-fixtures-fresh-v1.json");
    expect(packageJson.files).toContain("evaluation/fixture-manifest.json");
    expect(packageJson.files).toContain("evaluation/source-fixtures/benchmark-regression-v2.json");
    expect(packageJson.files).toContain("evaluation/results/benchmark-regression-v2.json");
    expect(packageJson.files).toContain("evaluation/rescore-manifest.json");
    expect(fs.existsSync(path.join(root, "scripts/smoke-packed.mjs"))).toBe(true);
    expect(readme).toContain("pi install git:github.com/codyborders/caveman-milk-pi");
    expect(changelog).toContain("## 0.4.0-beta.1 - Unreleased");
    expect(changelog).not.toContain("## Unreleased");
    expect(credits).toContain("@codyborders/caveman-milk-pi");
    expect(gitAttributes).toContain("evaluation/results/benchmark-regression-v2-rescored.json -text");
    expect(gitAttributes).toContain("evaluation/results/benchmark-regression-v2-rescored.md -text");
  });
});
