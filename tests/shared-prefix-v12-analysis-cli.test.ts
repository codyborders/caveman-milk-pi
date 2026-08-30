// Final analysis generation is deterministic and hashes every preserved run artifact.
// The CLI writes versioned JSON, Markdown, and an artifact manifest without changing raw inputs.

import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(".");
const script = path.join(root, "scripts/eval/shared-prefix-v12-analysis-cli.mjs");
const finalRaw = path.join(root, "evaluation/results/shared-prefix-v12-final-v1.json");
const preflights = [1, 2, 3].map((version) =>
  path.join(root, `evaluation/results/shared-prefix-v12-preflight-v${version}.json`),
);

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function run(outputDir: string): { json: string; markdown: string; manifest: string } {
  const json = path.join(outputDir, "analysis.json");
  const markdown = path.join(outputDir, "analysis.md");
  const manifest = path.join(outputDir, "manifest.json");
  execFileSync(process.execPath, [
    script,
    "--final", finalRaw,
    ...preflights.flatMap((filePath) => ["--preflight", filePath]),
    "--json", json,
    "--markdown", markdown,
    "--manifest", manifest,
    "--artifact-root", root,
  ], { cwd: root, encoding: "utf8" });
  return { json, markdown, manifest };
}

describe("shared-prefix v12 analysis CLI", () => {
  it("regenerates byte-identical reports and verifies preserved artifact hashes", () => {
    const rawBefore = sha256(finalRaw);
    const first = run(fs.mkdtempSync(path.join(os.tmpdir(), "v12-analysis-a-")));
    const second = run(fs.mkdtempSync(path.join(os.tmpdir(), "v12-analysis-b-")));
    expect(fs.readFileSync(first.json)).toEqual(fs.readFileSync(second.json));
    expect(fs.readFileSync(first.markdown)).toEqual(fs.readFileSync(second.markdown));
    const markdown = fs.readFileSync(first.markdown, "utf8");
    expect(markdown).toContain("\n## Eligible group\n");
    expect(markdown).toContain("| Complete-product tokens | 35 | +108341.8 | +124711.3 |");
    expect(markdown).toContain("| Isolated output tokens | 35 | -202.8 | -142.1 |");
    expect(markdown).toContain("| Candidate prompt tokens | 0 |");
    expect(markdown).not.toContain('"tCritical"');
    expect(sha256(finalRaw)).toBe(rawBefore);

    const analysis = JSON.parse(fs.readFileSync(first.json, "utf8"));
    expect(analysis.final.validWarmPairs).toBe(35);
    expect(analysis.final.exclusions).toBe(0);
    expect(analysis.mode.default).toBe("off");

    const manifest = JSON.parse(fs.readFileSync(first.manifest, "utf8"));
    expect(manifest.artifacts.length).toBeGreaterThanOrEqual(14);
    expect(
      manifest.artifacts.filter((artifact) => artifact.path.endsWith(".tar.gz")),
    ).toHaveLength(4);
    for (const artifact of manifest.artifacts) {
      expect(sha256(path.join(root, artifact.path))).toBe(artifact.sha256);
    }
  });
});
