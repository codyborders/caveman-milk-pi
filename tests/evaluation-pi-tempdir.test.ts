// The Pi runner must keep its temporary HOME directories inside the system
// temporary directory instead of polluting the repository working tree.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner temp directory hygiene", () => {
  it("creates the controlled HOME under the system temp directory", async () => {
    const markerDir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-hygiene-"));
    const before = fs.readdirSync(process.cwd()).filter((name) => name.startsWith("caveman-pi-home-"));
    let capturedHome;
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (_args, options) => {
        capturedHome = options.env.HOME;
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
    const after = fs.readdirSync(process.cwd()).filter((name) => name.startsWith("caveman-pi-home-"));
    expect(after.length).toBe(before.length);
    expect(fs.realpathSync(capturedHome).startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
    fs.rmSync(markerDir, { recursive: true, force: true });
  });
});
