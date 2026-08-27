// Evaluation tests verify fixture coverage, runtime prompt parity, paid-run safeguards, and provider result scoring.

import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { computeInjection } from "../src/injection.js";
import { createOfflineReport, loadFixtures, runProviderEvaluation } from "../scripts/evaluate.mjs";

const fixtures = loadFixtures();

describe("offline evaluation", () => {
  it("keeps committed runtime prompts equal to production output", () => {
    for (const mode of fixtures.modes) {
      expect(fixtures.runtimePrompts[mode], `mode=${mode}`).toBe(computeInjection(mode).text);
    }
  });

  it("emits a deterministic full matrix", () => {
    const first = createOfflineReport(fixtures);
    const second = createOfflineReport(fixtures);

    expect(first).toEqual(second);
    expect(first.categoryCount).toBe(15);
    expect(first.caseCount).toBe(105);
    expect(Math.max(...Object.values(first.injectionLengths))).toBeLessThanOrEqual(800);
  });

  it("writes structured output from the CLI", () => {
    const output = execFileSync("node", [path.resolve("scripts/evaluate.mjs")], {
      encoding: "utf8",
    });
    const report = JSON.parse(output) as { provider: string; caseCount: number };
    expect(report).toMatchObject({ provider: "offline", caseCount: 105 });
  });
});

describe("provider evaluation", () => {
  it("rejects provider execution without explicit paid-run authorization", () => {
    const result = spawnSync("node", [path.resolve("scripts/evaluate.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "anthropic",
        CAVEMAN_EVAL_ALLOW_PAID: "0",
        ANTHROPIC_API_KEY: "test-key",
        CAVEMAN_EVAL_MODEL: "test-model",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("explicit paid-run authorization");
  });

  it("scores matched off and active provider responses", async () => {
    const responses = ["cache_key uses model identity", "cache_key identity"];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: responses.shift() }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const compactFixtures = {
      version: 1,
      modes: ["off", "full"],
      runtimePrompts: {
        off: fixtures.runtimePrompts.off,
        full: fixtures.runtimePrompts.full,
      },
      categories: [fixtures.categories[0]],
    };

    const report = await runProviderEvaluation({
      apiKey: "test-key",
      model: "test-model",
      allowPaid: true,
      endpoint: "https://example.invalid/messages",
      fetchImpl,
      fixtures: compactFixtures,
    });

    expect(report.provider).toBe("anthropic");
    expect(report.caseCount).toBe(2);
    expect(report.passed).toBe(true);
    expect(report.results.every((result) => result.requiredTermRatio === 1)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("captures persisted text from an Anthropic tool call", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "write_artifact",
              input: { content: "Configuration remains valid after restart." },
            },
          ],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const category = fixtures.categories.find((item) => item.id === "tool-argument");
    if (category === undefined) throw new Error("tool fixture is missing");

    const report = await runProviderEvaluation({
      apiKey: "test-key",
      model: "test-model",
      allowPaid: true,
      endpoint: "https://example.invalid/messages",
      fetchImpl,
      fixtures: {
        version: 1,
        modes: ["off"],
        runtimePrompts: { off: "" },
        categories: [category],
      },
    });

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody.tool_choice).toEqual({ type: "tool", name: "write_artifact" });
    expect(report.results[0].toolCallCount).toBe(1);
    expect(report.results[0].requiredTermsPassed).toBe(true);
  });
});
