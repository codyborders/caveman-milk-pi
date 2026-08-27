// Provider "pi" routes execution through the Pi runner adapter with no direct
// API key requirement and no real provider call (spawn is injected).

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions } from "./helpers/mock-provider-server.js";

const jsonl = [
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "cache_key uses model identity." }],
      usage: { input: 50, output: 30, cacheRead: 10, cacheWrite: 5, cost: { total: 0.0005 } },
    },
  }),
].join("\n");

describe("pi provider routing", () => {
  it("executes the paired plan through the injected Pi runner", async () => {
    const spawns = [];
    const report = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        provider: "pi",
        apiKey: undefined,
        spawnImpl: async (args, options) => {
          spawns.push({ args, options });
          return { code: 0, stdout: jsonl, stderr: "" };
        },
      }),
    );
    expect(spawns.length).toBe(6);
    const first = spawns[0];
    expect(first.args.includes("--session-id")).toBe(true);
    expect(first.options.env.HOME).not.toBe(process.env.HOME);
    expect(report.provider).toBe("pi");
    expect(report.runner).toBe("pi");
    expect(report.environment.runner).toBe("pi");
    expect(report.caseCount).toBe(6);
    expect(report.results.every((result) => result.usage.input === 50)).toBe(true);
    expect(report.results.every((result) => result.costUsd === 0.0005)).toBe(true);
  });
});
