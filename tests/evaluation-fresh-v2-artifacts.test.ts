// Fresh-v2 artifact lock. Checks that every paid raw report remains byte-identical.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "evaluation/fresh-v2-artifacts-manifest.json");

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("fresh-v2 artifact manifest", () => {
  it("locks the fixture and all six raw reports", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.fixture.sha256).toBe("8bd5776b40800d69e238100bfe5ccddf00e6d5ab826919c8c400835f9caf353a");
    expect(manifest.rawReports).toHaveLength(6);
    for (const artifact of [manifest.fixture, ...manifest.rawReports]) {
      expect(sha256(path.join(root, artifact.path)), artifact.path).toBe(artifact.sha256);
    }
    expect(manifest.externalAttempts).toEqual({ primary: 612, judge: 300, total: 912 });
  });
});
