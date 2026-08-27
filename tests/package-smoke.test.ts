import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("packed package smoke test", () => {
  it("loads through Pi extension loader, activates, and disables", () => {
    const script = path.resolve(here, "../scripts/smoke-packed.mjs");
    const result = spawnSync(process.execPath, [script], {
      cwd: path.dirname(script),
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 180_000);
});
