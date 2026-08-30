import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("selective-final v11 development check", () => {
  it("checks locked fresh-v3, exclusions, zero-byte off, child off, and one finalizer injection", () => {
    const output = execFileSync(process.execPath, [path.join(root, "scripts/eval/prompt-contract-v11-dev-check.mjs")], { cwd: root, encoding: "utf8" });
    expect(output).toContain("fixture hash verified: df12469c154635f1c00cebb6490e6fcacbd78dfcae584eb5c10b27ddf13c37d3");
    expect(output).toContain("off: 0 bytes; child mode: off; handoff: normal; finalizer injections: 1");
    expect(output).toContain("finalizer injections: 1");
    expect(output).toContain("all selective-final v11 development checks passed");
  });
});
