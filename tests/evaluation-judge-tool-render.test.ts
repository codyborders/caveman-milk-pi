// Tool-aware blinded judging: when an arm answered through tool calls, the
// judge payload must render that arm through the deterministic renderer so
// the judge sees the ordered complete calls and the final assistant text.
// Initial failure: judge input contained raw artifact text only, with
// no rendered toolCalls for the tool arm.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

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
      usage: { input: 100, output: 20, cacheRead: 10, cacheWrite: 5 },
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
      usage: { input: 120, output: 8, cacheRead: 40, cacheWrite: 2 },
    },
  }),
].join("\n");

const verdictText = JSON.stringify({
  completeness: { A: 4, B: 4 },
  correctness: { A: 4, B: 4 },
  groundedness: { A: 4, B: 4 },
  notes: "both equal",
});

describe("tool-aware blinded judging", () => {
  it("renders tool arms through the deterministic renderer inside judge input", async () => {
    const judgePrompts = [];
    const spawnImpl = async (args, options) => {
      const config = JSON.parse(
        fs.readFileSync(
          path.join(options.env.CAVEMAN_MILK_CONFIG_DIR, "caveman-milk-pi.json"),
          "utf8",
        ),
      );
      const isJudge = args.includes("--system-prompt");
      const promptIndex = args.indexOf("-p");
      if (isJudge) {
        judgePrompts.push(args[promptIndex + 1]);
      }
      const stdout = isJudge
        ? [
            JSON.stringify({
              type: "message_end",
              message: {
                role: "assistant",
                content: [{ type: "text", text: verdictText }],
                usage: { input: 44, output: 12, cacheRead: 2, cacheWrite: 1 },
              },
            }),
          ].join("\n")
        : toolLoopJsonl;
      return { code: 0, stdout, stderr: "" };
    };

    const report = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        provider: "pi",
        apiKey: undefined,
        categories: ["tool-argument"],
        judge: true,
        spawnImpl,
      }),
    );

    expect(judgePrompts.length).toBe(3);
    for (const prompt of judgePrompts) {
      // The rendered arm is one JSON object embedded in the blinded payload.
      expect(prompt.match(/Response [AB]:\n\{"toolCalls":/)).not.toBeNull();
      // No mode or configuration leakage into judge input.
      expect(prompt).not.toMatch(/"mode"|caveman|showStatus|schemaVersion/i);
      expect(prompt).toContain("Task prompt:\n");
      expect(prompt.match(/---\n\n/g).length).toBe(2);
    }
    expect(
      report.results
        .filter((result) => result.mode !== "off")
        .every((result) => result.judge?.failed === false),
    ).toBe(true);
  });
});
