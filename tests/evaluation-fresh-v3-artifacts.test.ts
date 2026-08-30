import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFreshV3Analysis, buildFreshV3PrSummary } from "../scripts/eval/fresh-v3-analysis.mjs";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "evaluation/fresh-v3-artifacts-manifest.json");

function sha256(relativePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex");
}

describe("fresh-v3 v2 artifact lock", () => {
  it("requires versioned v2 analysis and generated PR summary outputs", () => {
    expect(fs.existsSync(path.join(root, "evaluation/results/fresh-v3-analysis-v2.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "evaluation/results/fresh-v3-analysis-v2.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "evaluation/results/fresh-v3-pr-summary-v2.md"))).toBe(true);
  });

  it("locks every v2 output against platform line-ending conversion", () => {
    const attributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
    for (const file of [
      "evaluation/results/fresh-v3-analysis-v2.json",
      "evaluation/results/fresh-v3-analysis-v2.md",
      "evaluation/results/fresh-v3-pr-summary-v2.md",
    ]) {
      expect(attributes).toContain(`${file} -text`);
    }
  });
});

describe("fresh-v3 artifact lock", () => {
  it("keeps the frozen fixture, raw reports, and derived reports byte-identical", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.artifacts).toHaveLength(10);
    for (const artifact of manifest.artifacts) {
      expect(sha256(artifact.path), artifact.path).toBe(artifact.sha256);
    }
  });
});

describe("fresh-v3 v2 reproducibility", () => {
  it("matches committed JSON, Markdown, and PR summary byte-for-byte", () => {
    const analysis = buildFreshV3Analysis();
    const json = `${JSON.stringify(Object.fromEntries(Object.entries(analysis).filter(([key]) => key !== "markdown")), null, 2)}\n`;
    expect(json).toBe(fs.readFileSync(path.join(root, "evaluation/results/fresh-v3-analysis-v2.json"), "utf8"));
    expect(analysis.markdown).toBe(fs.readFileSync(path.join(root, "evaluation/results/fresh-v3-analysis-v2.md"), "utf8"));
    expect(buildFreshV3PrSummary(analysis)).toBe(fs.readFileSync(path.join(root, "evaluation/results/fresh-v3-pr-summary-v2.md"), "utf8"));
    expect(analysis.markdown).not.toContain("\\n");
    expect(buildFreshV3PrSummary(analysis)).not.toContain("\\n");
    for (const [name, value] of Object.entries(analysis.taskSuccess)) {
      expect(analysis.markdown).toContain(`| ${name} | ${value.pairCount} |`);
      expect(buildFreshV3PrSummary(analysis)).toContain(`| ${name} | ${value.pairCount} |`);
    }
  });
});
