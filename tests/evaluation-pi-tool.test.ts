// Pi tool-loop tests verify write_artifact registration and JSON event parsing without a provider request.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const output = [
  JSON.stringify({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "write_artifact",
    args: { content: "Configuration remains valid after restart." },
  }),
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Stored." }],
      usage: { input: 20, output: 4 },
    },
  }),
].join("\n");

describe("Pi evaluation tool loop", () => {
  it("loads the evaluation tool and returns its structured input", async () => {
    const spawns = [];
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      toolExtensionPath: "/repo/scripts/eval/pi-eval-tool.ts",
      model: "test-model",
      spawnImpl: async (args) => {
        spawns.push(args);
        return { code: 0, stdout: output, stderr: "" };
      },
    });

    const result = await runner.execute({
      mode: "full",
      category: { id: "tool-argument", prompt: "Store text.", expectsTool: true },
      repetition: 1,
    });

    const extensionFlags = spawns[0]
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value === "-e")
      .map((entry) => spawns[0][entry.index + 1]);
    expect(extensionFlags).toEqual([
      "/repo/index.ts",
      "/repo/scripts/eval/pi-eval-tool.ts",
    ]);
    expect(spawns[0]).toContain("--tools");
    expect(spawns[0][spawns[0].indexOf("--tools") + 1]).toBe("write_artifact");
    expect(spawns[0]).not.toContain("--no-tools");
    expect(result.toolCall).toEqual({
      name: "write_artifact",
      input: { content: "Configuration remains valid after restart." },
    });
  });

  it("disables every tool for ordinary response cases", async () => {
    const spawns = [];
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      toolExtensionPath: "/repo/scripts/eval/pi-eval-tool.ts",
      model: "test-model",
      spawnImpl: async (args) => {
        spawns.push(args);
        return {
          code: 0,
          stdout: JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Plain response." }],
              usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0 },
            },
          }),
          stderr: "",
        };
      },
    });

    await runner.execute({
      mode: "off",
      category: { id: "comparison", prompt: "Compare options." },
      repetition: 1,
    });

    expect(spawns[0]).toContain("--no-tools");
    expect(spawns[0]).not.toContain("--tools");
  });
});
