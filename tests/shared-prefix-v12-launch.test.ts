// Real Pi launch accounting records elapsed time and explicit thinking mode.
// A deterministic spawn stub verifies arguments and normalized usage.

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultLaunchNode } from "../scripts/eval/shared-prefix-v12-launch.mjs";

describe("shared-prefix v12 Pi launcher", () => {
  it("records elapsed time and sends explicit thinking mode", async () => {
    const calls: Array<{ args: string[] }> = [];
    const times = [100, 350];
    const launch = createDefaultLaunchNode({
      model: "test-model",
      thinking: "medium",
      nowImpl: () => times.shift() ?? 350,
      spawnImpl: async (args) => {
        calls.push({ args });
        return {
          code: 0,
          stderr: "",
          stdout: `${JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "done" }],
              usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4 },
            },
          })}\n`,
        };
      },
    });
    const result = await launch({ kind: "finalizer", nodeId: "finalizer", prompt: "work" });
    expect(path.isAbsolute(calls[0].args[0])).toBe(true);
    expect(calls[0].args).toContain("--no-tools");
    expect(calls[0].args).toContain("--thinking");
    expect(calls[0].args).toContain("medium");
    expect(result.elapsedMs).toBe(250);
    expect(result.usage).toEqual({ input: 10, output: 2, cacheWrite: 4, cacheRead: 3 });
  });
});
