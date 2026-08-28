// A real Pi run returned an assistant message_end with empty content,
// stopReason "error", and an errorMessage such as an OAuth refresh failure.
// The runner must report that provider error instead of the misleading
// "no assistant text" message. The fake spawn replaces the child process,
// so no provider call happens.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner provider error reporting", () => {
  it("throws the Pi provider errorMessage for an errored assistant message_end", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-err-"));
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async () => ({
        code: 0,
        stdout: [
          JSON.stringify({ type: "agent_start" }),
          JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [],
              stopReason: "error",
              errorMessage: "OAuth refresh failed for provider anthropic",
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
            },
          }),
          JSON.stringify({ type: "agent_end", messages: [] }),
        ].join("\n"),
        stderr: "",
      }),
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      nowImpl: (() => { let t = 0; return () => (t += 5); })(),
    });

    await expect(
      runner.execute({
        mode: "off",
        category: { id: "negation", prompt: "Explain this backup policy." },
        repetition: 1,
      }),
    ).rejects.toThrow(/OAuth refresh failed for provider anthropic/);

    await expect(
      runner.executeJudge({
        system: "judge system",
        user: "judge user",
        model: "judge-model",
      }),
    ).rejects.toThrow(/OAuth refresh failed for provider anthropic/);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });

  it("keeps the provider error sticky when a later assistant turn succeeds", async () => {
    // Initial failure: the pre-fix runner returned the later turn's text and
    // masked the earlier provider error entirely.
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-err-sticky-"));
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async () => ({
        code: 0,
        stdout: [
          JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [],
              stopReason: "error",
              errorMessage: "upstream 503 during tool loop",
              usage: { input: 5, output: 1 },
            },
          }),
          JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Recovered text must not mask the error." }],
              usage: { input: 15, output: 6 },
            },
          }),
        ].join("\n"),
        stderr: "",
      }),
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
    });

    // A successful later turn must never hide an earlier provider failure.
    await expect(
      runner.execute({
        mode: "off",
        category: { id: "negation", prompt: "Explain this backup policy." },
        repetition: 1,
      }),
    ).rejects.toThrow(/Pi provider error: upstream 503 during tool loop/);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
});
