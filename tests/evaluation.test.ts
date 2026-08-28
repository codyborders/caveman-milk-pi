// Evaluation tests verify fixture coverage, runtime prompt parity, paid-run safeguards, and provider result scoring.

import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { computeInjection } from "../src/injection.js";
import { VALID_MODES } from "../src/types.js";
import {
  countPromptTokens,
  createOfflineReport,
  loadFixtures,
  runProviderEvaluation,
} from "../scripts/evaluate.mjs";

const fixtures = loadFixtures();

describe("offline evaluation", () => {
  it("keeps committed runtime prompts equal to production output", () => {
    expect(fixtures).not.toHaveProperty("commonRules");
    expect(fixtures).not.toHaveProperty("modeRules");
    for (const mode of VALID_MODES) {
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
    expect(first.tokenAccounting).toMatchObject({
      method: "provider-count-endpoint",
      status: "not-run",
      endpointPath: "/v1/messages/count_tokens",
    });
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
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const mode = JSON.parse(body.metadata.user_id).mode;
      const text = mode === "off" ? "cache_key uses model identity" : "cache_key identity";
      const outputTokens = mode === "off" ? 40 : 20;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: outputTokens },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
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
    expect(report.caseCount).toBe(6);
    expect(report.passed).toBe(true);
    expect(report.results.every((result) => result.requiredTermRatio === 1)).toBe(true);
    expect(report.tokenAccounting).toMatchObject({ status: "not-run", model: "test-model" });
    expect(report.results.every((result) => result.mode !== "off" ? result.tokenRatioToOff === 0.5 : true)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("records exact token count from provider count endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ input_tokens: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      countPromptTokens({
        apiKey: "test-key",
        model: "test-model",
        prompt: "prompt",
        endpoint: "https://example.invalid/v1/messages/count_tokens",
        fetchImpl,
      }),
    ).resolves.toEqual({ model: "test-model", inputTokens: 123 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports total and incremental counts while changing only Caveman injection", async () => {
    const countResponses = [100, 137];
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.messages[0].content === "Count this prompt.") {
        return new Response(JSON.stringify({ input_tokens: countResponses.shift() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "cache_key identity" }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const compactFixtures = {
      version: 1,
      modes: ["off", "full"],
      runtimePrompts: { off: "", full: fixtures.runtimePrompts.full },
      promptContract: fixtures.promptContract,
      categories: [fixtures.categories[0]],
    };
    const report = await runProviderEvaluation({
      apiKey: "test-key",
      model: "test-model",
      allowPaid: true,
      endpoint: "https://example.invalid/messages",
      fetchImpl,
      fixtures: compactFixtures,
      countTokens: true,
      countEndpoint: "https://example.invalid/v1/messages/count_tokens",
    });

    const countBodies = fetchImpl.mock.calls.slice(0, 2).map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    expect(countBodies[0]).toMatchObject({
      model: "test-model",
      system: "",
      messages: [{ role: "user", content: "Count this prompt." }],
    });
    expect(countBodies[1]).toMatchObject({
      model: "test-model",
      system: fixtures.runtimePrompts.full,
      messages: [{ role: "user", content: "Count this prompt." }],
    });
    expect({ ...countBodies[0], system: "Caveman injection removed" }).toEqual({
      ...countBodies[1],
      system: "Caveman injection removed",
    });
    expect(report.tokenAccounting).toMatchObject({
      status: "exact",
      model: "test-model",
      totalRequestInputTokens: { off: 100, full: 137 },
      incrementalActiveMinusOffTokens: { full: 37 },
      exactCounts: {
        off: { model: "test-model", inputTokens: 100 },
        full: { model: "test-model", inputTokens: 137, incrementalInputTokens: 37 },
      },
    });
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
