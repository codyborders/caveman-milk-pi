// Report-level tool-loop accounting: accumulated Pi usage, per-turn raw
// usage, ordered tool calls, assistant turn counts, and schema version 3
// must all reach the persisted report while validators still receive the
// expected write_artifact call. Initial failure: schema 2 and
// undefined turn fields at report level.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

const firstTurnUsage = { input: 100, output: 20, cacheRead: 10, cacheWrite: 5, cost: { total: 0.001 } };
const finalTurnUsage = { input: 120, output: 8, cacheRead: 40, cacheWrite: 2, cost: { total: 0.0015 } };

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

describe("report-level tool-loop accounting", () => {
  it("carries accumulated turns, raw usage, tool calls, and schema version 3", async () => {
    const report = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        provider: "pi",
        apiKey: undefined,
        categories: ["tool-argument"],
        spawnImpl: async () => ({ code: 0, stdout: toolLoopJsonl, stderr: "" }),
      }),
    );

    expect(report.schemaVersion).toBe(3);
    for (const result of report.results) {
      expect(result.assistantTurns).toBe(2);
      expect(result.rawUsageTurns).toEqual([firstTurnUsage, finalTurnUsage]);
      expect(result.toolCalls).toEqual([
        { name: "write_artifact", input: { content: "Configuration remains valid after restart." } },
      ]);
      expect(result.usage).toEqual({ input: 220, output: 28, cacheWrite: 7, cacheRead: 50 });
      expect(result.costUsd).toBe(0.0025);
      expect(result.response).toBe("Stored configuration remains valid after restart.");
      // Deterministic validators receive the expected single tool call.
      expect(result.toolCall).toEqual({
        name: "write_artifact",
        input: { content: "Configuration remains valid after restart." },
      });
      expect(result.validationPassed).toBe(true);
    }
  });
});
