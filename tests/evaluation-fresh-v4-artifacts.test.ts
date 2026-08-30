import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
});
