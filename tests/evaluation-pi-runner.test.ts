// Pi runner adapter: spawns Pi in documented JSON mode with the extension
// loaded, a controlled HOME carrying the mode config, and a stable session id.
// The fake spawn replaces the child process, so no provider call happens.

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
  it("runs Pi in JSON mode with the extension and parses usage", async () => {
    const spawns = [];
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-test-"));
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (args, options) => {
        spawns.push({ args, options });
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
    expect(flags).toContain("--session-id");
    expect(flags[flags.indexOf("--session-id") + 1]).toBe("caveman-eval-2-negation-full");
    expect(flags).toContain("--model");
    expect(flags[flags.indexOf("--model") + 1]).toBe("test-model");
    expect(flags[flags.indexOf("-p") + 1]).toBe("Explain this backup policy.");

    const home = spawn.options.env.HOME;
    const config = JSON.parse(
      fs.readFileSync(path.join(home, ".config", "caveman-milk-pi.json"), "utf8"),
    );
    expect(config).toEqual({ schemaVersion: 1, mode: "full", showStatus: false });
    expect(spawn.options.env.HOME).not.toBe(process.env.HOME);

    expect(outcome.text).toBe("Do not delete backups. cache_key uses model identity.");
    expect(outcome.usage).toEqual({ input: 120, output: 32, cacheWrite: 12, cacheRead: 80 });
    expect(outcome.costUsd).toBe(0.001);
    expect(outcome.sessionId).toBe("caveman-eval-2-negation-full");
    expect(outcome.elapsedMs).toBeGreaterThan(0);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
});
