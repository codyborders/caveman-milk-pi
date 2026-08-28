// The Pi runner must provide a working default spawn so the CLI pi provider
// works without an injected spawn implementation. The helper is JavaScript,
// so the default spawn must execute it through the current node executable
// on every platform instead of relying on shell shims.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner default spawn", () => {
  it("runs a JavaScript helper through node and fails on missing assistant text", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-spawn-"));
    const helper = path.join(directory, "silent-helper.mjs");
    // Exits successfully while emitting no assistant events at all.
    fs.writeFileSync(helper, "process.exit(0);\n", { encoding: "utf8" });
    try {
      const runner = evaluate.createPiRunner({
        piBin: helper,
        extensionPath: "/repo/index.ts",
        model: "test-model",
      });
      // The helper exits 0 with no JSON events, so execution must fail on
      // the missing assistant message rather than on spawn support.
      await expect(
        runner.execute({ mode: "off", category: { id: "c", prompt: "p" }, repetition: 1 }),
      ).rejects.toThrow(/no assistant text/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
