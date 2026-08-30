// Pi-based blinded judging: provider "pi" with judge=true runs every judge
// through a fresh Pi process, so no Anthropic key is required. The fake spawn
// replaces the child process, so no provider call happens.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

const verdictText = JSON.stringify({
  completeness: { A: 4, B: 4 },
  correctness: { A: 4, B: 4 },
  groundedness: { A: 4, B: 4 },
  notes: "both equal",
});

const judgeJsonl = [
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: verdictText }],
      usage: { input: 44, output: 12, cacheRead: 2, cacheWrite: 1, cost: { total: 0.002 } },
    },
  }),
].join("\n");

function caseJsonl(mode) {
  const active = mode !== "off";
  return [
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Do not delete backups. cache_key uses model identity." }],
        usage: { input: 50, output: active ? 20 : 40, cacheRead: 10, cacheWrite: 5 },
      },
    }),
  ].join("\n");
}

describe("pi blinded judge", () => {
  it("runs every judge through fresh Pi processes without an Anthropic key", async () => {
    const spawns = [];
    const spawnImpl = async (args, options) => {
      const config = JSON.parse(
        fs.readFileSync(
          path.join(options.env.CAVEMAN_MILK_CONFIG_DIR, "caveman-milk-pi.json"),
          "utf8",
        ),
      );
      const isJudge = args.includes("--system-prompt");
      spawns.push({ args, options, isJudge });
      return {
        code: 0,
        stdout: isJudge ? judgeJsonl : caseJsonl(config.mode),
        stderr: "",
      };
    };
    const report = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        provider: "pi",
        apiKey: undefined,
        judge: true,
        spawnImpl,
      }),
    );
    expect(report.judge.enabled).toBe(true);
    const judged = report.results.filter((result) => result.mode === "full");
    expect(judged.length).toBe(3);
    for (const result of judged) {
      expect(result.judge).not.toBeNull();
      expect(result.judge.failed).toBe(false);
      expect(result.judge.assistantTurns).toBe(1);
      expect(result.judge.rawUsageTurns).toEqual([
        { input: 44, output: 12, cacheRead: 2, cacheWrite: 1, cost: { total: 0.002 } },
      ]);
      expect(result.judge.costUsd).toBe(0.002);
      expect(result.qualityPassed).toBe(true);
    }
    expect(spawns.filter((spawn) => spawn.isJudge).length).toBe(3);
    // One reserved shared-cap attempt per judge process, reported under judge.
    expect(report.paidCallAccounting.actual).toEqual({
      provider: 6,
      judge: 3,
      countEndpoint: 0,
      total: 9,
    });
    expect(report.passed).toBe(true);
  });
});
