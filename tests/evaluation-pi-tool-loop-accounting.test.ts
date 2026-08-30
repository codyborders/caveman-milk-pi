// Pi tool-loop accounting: a session whose assistant emits a tool-call turn,
// executes the tool, then answers, must accumulate every assistant
// message_end usage and cost instead of keeping only the final turn. Red
// Initial failure: first-turn usage dropped, cost not summed, and no
// per-turn arrays existed.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const firstTurnUsage = {
  input: 100,
  output: 20,
  cacheRead: 10,
  cacheWrite: 5,
  cost: { total: 0.001 },
};
const finalTurnUsage = {
  input: 120,
  output: 8,
  cacheRead: 40,
  cacheWrite: 2,
  cost: { total: 0.0015 },
};

const toolLoopJsonl = [
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call-1",
          name: "write_artifact",
          input: { content: "Configuration remains valid after restart." },
        },
      ],
      usage: firstTurnUsage,
    },
  }),
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
      content: [{ type: "text", text: "Stored configuration remains valid after restart." }],
      usage: finalTurnUsage,
    },
  }),
].join("\n");

describe("pi tool-loop accounting", () => {
  it("sums usage and cost across every assistant turn and preserves per-turn raw usage", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-loop-"));
    try {
      const runner = evaluate.createPiRunner({
        piBin: "/opt/pi/bin/pi",
        extensionPath: "/repo/index.ts",
        model: "test-model",
        spawnImpl: async () => ({ code: 0, stdout: toolLoopJsonl, stderr: "" }),
        mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      });
      const outcome = await runner.execute({
        mode: "full",
        category: { id: "file-writing", prompt: "Store text." },
        repetition: 1,
      });

      expect(outcome.assistantTurns).toBe(2);
      expect(outcome.usage).toEqual({ input: 220, output: 28, cacheWrite: 7, cacheRead: 50 });
      expect(outcome.costUsd).toBe(0.0025);
      expect(outcome.rawUsageTurns).toEqual([firstTurnUsage, finalTurnUsage]);
      expect(outcome.text).toBe("Stored configuration remains valid after restart.");
      expect(outcome.toolCalls).toEqual([
        { name: "write_artifact", input: { content: "Configuration remains valid after restart." } },
      ]);
      expect(outcome.toolCallCount).toBe(1);
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });

  it("keeps a token total unknown when any assistant turn omits that token field", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-loop-missing-"));
    const incompleteJsonl = [
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "First" }],
          usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 1 },
        },
      }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Final" }],
          usage: { input: 20, output: 4, cacheWrite: 2 },
        },
      }),
    ].join("\n");
    try {
      const runner = evaluate.createPiRunner({
        piBin: "/opt/pi/bin/pi",
        extensionPath: "/repo/index.ts",
        model: "test-model",
        spawnImpl: async () => ({ code: 0, stdout: incompleteJsonl, stderr: "" }),
        mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      });
      const outcome = await runner.execute({
        mode: "off",
        category: { id: "text", prompt: "Answer." },
        repetition: 1,
      });

      expect(outcome.usage).toEqual({ input: 30, output: 6, cacheWrite: 3, cacheRead: null });
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });
});
