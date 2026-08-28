// The Pi runner must keep its temporary config directory inside the system
// temporary directory instead of polluting the repository working tree, and
// must remove it after each single-turn call.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner temp directory hygiene", () => {
  it("creates the isolated config directory under the system temp directory and cleans it", async () => {
    const markerDir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-hygiene-"));
    const before = fs
      .readdirSync(process.cwd())
      .filter((name) => name.startsWith("caveman-pi-config-"));
    let capturedConfigDir;
    let capturedRealPath;
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (_args, options) => {
        capturedConfigDir = options.env.CAVEMAN_MILK_CONFIG_DIR;
        capturedRealPath = fs.realpathSync(capturedConfigDir);
        return {
          code: 0,
          stdout: JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "ok." }],
              usage: { input: 1, output: 1 },
            },
          }),
          stderr: "",
        };
      },
    });
    await runner.execute({ mode: "off", category: { id: "c", prompt: "p" }, repetition: 1 });
    const after = fs
      .readdirSync(process.cwd())
      .filter((name) => name.startsWith("caveman-pi-config-"));
    expect(after.length).toBe(before.length);
    expect(capturedRealPath.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
    // Cleanup: the directory is removed once the call finishes.
    expect(fs.existsSync(capturedConfigDir)).toBe(false);
    fs.rmSync(markerDir, { recursive: true, force: true });
  });
});
