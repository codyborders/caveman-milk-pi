// Real-spawn test for the Pi runner's defaultSpawn termination reporting: a
// child killed by a signal (for example the spawn timeout) must surface as an
// explicit error instead of being masked as exit code 0 with empty output.
// The probe is a local Node script, so no provider call happens.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner default spawn termination reporting", () => {
  it("reports a signal termination explicitly instead of masking it as exit code 0", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-signal-"));
    const file = path.join(dir, "sleep-probe.mjs");
    fs.writeFileSync(file, "setTimeout(() => {}, 60000);\n", "utf8");
    try {
      const runner = evaluate.createPiRunner({
        piBin: file,
        extensionPath: "/repo/index.ts",
        model: "test-model",
        timeoutMs: 400,
      });
      await expect(
        runner.execute({
          mode: "off",
          category: { id: "negation", prompt: "Explain this backup policy." },
          repetition: 1,
        }),
      ).rejects.toThrow(/signal|SIGTERM|timeout/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
