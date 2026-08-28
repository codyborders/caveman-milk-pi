// Pi runner adapter: spawns Pi in documented JSON mode with the extension
// loaded and an isolated config directory for the mode setting. Every call is
// a single-turn session: no --session-id reuse, no accumulated context. The
// fake spawn replaces the child process, so no provider call happens.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const jsonlEvents = [
  JSON.stringify({ type: "session", version: 3, id: "s1" }),
  JSON.stringify({ type: "agent_start" }),
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Do not delete backups. cache_key uses model identity." }],
      usage: { input: 120, output: 32, cacheRead: 80, cacheWrite: 12, cost: { total: 0.001 } },
    },
  }),
  JSON.stringify({ type: "agent_end", messages: [] }),
].join("\n");

describe("pi runner adapter", () => {
  it("runs Pi single-turn with an isolated CAVEMAN_MILK_CONFIG_DIR and parses usage", async () => {
    const spawns = [];
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-test-"));
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (args, options) => {
        spawns.push({
          args,
          options,
          config: JSON.parse(
            fs.readFileSync(
              path.join(options.env.CAVEMAN_MILK_CONFIG_DIR, "caveman-milk-pi.json"),
              "utf8",
            ),
          ),
        });
        return { code: 0, stdout: jsonlEvents, stderr: "" };
      },
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      nowImpl: (() => { let t = 0; return () => (t += 5); })(),
    });

    const outcome = await runner.execute({
      mode: "full",
      category: { id: "negation", prompt: "Explain this backup policy." },
      repetition: 2,
    });

    const spawn = spawns[0];
    expect(spawn.args[0]).toBe("/opt/pi/bin/pi");
    const [, ...flags] = spawn.args;
    expect(flags).toContain("--mode");
    expect(flags[flags.indexOf("--mode") + 1]).toBe("json");
    expect(flags).toContain("--no-extensions");
    expect(flags[flags.indexOf("-e") + 1]).toBe("/repo/index.ts");
    // Single-turn: no reused session id accumulates context across calls.
    expect(flags).not.toContain("--session-id");
    expect(flags).toContain("--model");
    expect(flags[flags.indexOf("--model") + 1]).toBe("test-model");
    expect(flags[flags.indexOf("-p") + 1]).toBe("Explain this backup policy.");

    // The extension config is isolated through the documented override and
    // carries the selected mode while the child process is running.
    const configDir = spawn.options.env.CAVEMAN_MILK_CONFIG_DIR;
    expect(typeof configDir).toBe("string");
    expect(spawn.config).toEqual({ schemaVersion: 1, mode: "full", showStatus: false });
    // The override isolates the extension from any platform user config, so
    // the runner must not depend on HOME semantics at all.
    expect(spawn.options.env.HOME).toBe(process.env.HOME);
    // Cleanup: the per-call config directory is removed after execution.
    expect(fs.existsSync(configDir)).toBe(false);

    expect(outcome.text).toBe("Do not delete backups. cache_key uses model identity.");
    expect(outcome.usage).toEqual({ input: 120, output: 32, cacheWrite: 12, cacheRead: 80 });
    // The raw message_end usage object is preserved verbatim, including
    // fields the normalized view drops such as cost.
    expect(outcome.rawUsage).toEqual({
      input: 120,
      output: 32,
      cacheRead: 80,
      cacheWrite: 12,
      cost: { total: 0.001 },
    });
    expect(outcome.costUsd).toBe(0.001);
    expect(outcome.sessionId).toBeNull();
    expect(outcome.elapsedMs).toBeGreaterThan(0);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });

  it("accepts a tool-only assistant turn when Pi returns no final text", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-tool-only-"));
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async () => ({
        code: 0,
        stdout: JSON.stringify({
          type: "tool_execution_start",
          toolName: "write_artifact",
          args: { content: "Persist this exact content." },
        }),
        stderr: "",
      }),
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
    });

    try {
      const outcome = await runner.execute({
        mode: "off",
        category: { id: "tool-argument", prompt: "Persist this text." },
        repetition: 1,
      });
      expect(outcome.text).toBe("");
      expect(outcome.toolCall).toEqual({
        name: "write_artifact",
        input: { content: "Persist this exact content." },
      });
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });
});
