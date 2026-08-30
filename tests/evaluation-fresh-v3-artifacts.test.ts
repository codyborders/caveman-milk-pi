import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "evaluation/fresh-v3-artifacts-manifest.json");

function sha256(relativePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex");
}

describe("fresh-v3 artifact lock", () => {
  it("keeps the frozen fixture, raw reports, and derived reports byte-identical", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.artifacts).toHaveLength(7);
    for (const artifact of manifest.artifacts) {
      expect(sha256(artifact.path), artifact.path).toBe(artifact.sha256);
    }
  });
});
