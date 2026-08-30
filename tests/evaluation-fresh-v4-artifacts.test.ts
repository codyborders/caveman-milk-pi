import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSelectiveFinalAnalysis,
  loadDefaultRuns,
  renderSelectiveFinalAnalysis,
} from "../scripts/eval/selective-final-v11-analysis.mjs";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "evaluation/fresh-v4-artifacts-manifest.json");

function hash(relativePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex");
}

describe("fresh-v4 artifact history", () => {
  it("preserves completed artifacts and marks future outputs as placeholders", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.fixtureFrozenBeforeTrials).toBe(true);
    for (const artifact of manifest.artifacts) {
      if (artifact.status === "not-run") {
        expect(artifact.sha256).toBeNull();
        continue;
      }
      expect(fs.existsSync(path.join(root, artifact.path)), artifact.path).toBe(true);
      expect(hash(artifact.path), artifact.path).toBe(artifact.sha256);
    }
  });

  it("rebuilds both derived reports from locked raw reports", () => {
    const analysis = buildSelectiveFinalAnalysis({ runs: loadDefaultRuns() });
    expect(`${JSON.stringify(analysis, null, 2)}\n`).toBe(
      fs.readFileSync(
        path.join(root, "evaluation/results/fresh-v4-analysis-v1.json"),
        "utf8",
      ),
    );
    expect(renderSelectiveFinalAnalysis(analysis)).toBe(
      fs.readFileSync(
        path.join(root, "evaluation/results/fresh-v4-analysis-v1.md"),
        "utf8",
      ),
    );
  });
});
