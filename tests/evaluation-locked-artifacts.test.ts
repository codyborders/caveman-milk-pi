// Byte-level locks for immutable paid-run artifacts. These seven files are
// permanent records. Any byte change, including whitespace, must fail the suite.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function loadManifest(): { schemaVersion: number; lockedArtifacts: Record<string, { path: string; sha256: string; role: string }> } {
  const manifestPath = path.join(repoRoot, "evaluation", "locked-artifacts-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

describe("locked evaluation artifacts", () => {
  it("keeps every locked artifact byte-identical to its recorded hash", () => {
    const manifest = loadManifest();
    for (const [name, entry] of Object.entries(manifest.lockedArtifacts)) {
      const bytes = readFileSync(path.join(repoRoot, entry.path));
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hash, `${name} (${entry.path})`).toBe(entry.sha256);
    }
  });

  it("locks exactly the seven immutable artifacts", () => {
    const manifest = loadManifest();
    expect(Object.keys(manifest.lockedArtifacts).sort()).toEqual([
      "benchmark-regression-v2-rescored-json",
      "benchmark-regression-v2-rescored-markdown",
      "benchmark-regression-v2-result",
      "benchmark-regression-v2-source-fixture",
      "benchmark-targeted-v2-json",
      "benchmark-targeted-v2-markdown",
      "fresh-v1-fixture",
    ]);
    const paths = Object.values(manifest.lockedArtifacts).map((entry) => entry.path).sort();
    expect(paths).toEqual([
      "evaluation/results/benchmark-regression-v2-rescored.json",
      "evaluation/results/benchmark-regression-v2-rescored.md",
      "evaluation/results/benchmark-regression-v2.json",
      "evaluation/results/benchmark-targeted-v2.json",
      "evaluation/results/benchmark-targeted-v2.md",
      "evaluation/source-fixtures/benchmark-regression-v2.json",
      "scripts/evaluation-fixtures-fresh-v1.json",
    ]);
  });
});
