#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "evaluation-fixtures.json");
const contractPath = path.join(here, "..", "src", "prompt-contract.json");

function loadPromptContract() {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (typeof contract.commonRules !== "string") {
    throw new Error("Prompt contract must define commonRules.");
  }
  if (typeof contract.modeRules !== "object" || contract.modeRules === null) {
    throw new Error("Prompt contract must define modeRules.");
  }
  if (
    contract.tokenAccounting?.method !== "provider-count-endpoint" ||
    typeof contract.tokenAccounting.endpointPath !== "string"
  ) {
    throw new Error("Prompt contract must define provider token accounting.");
  }
  return contract;
}

function createRuntimePrompts(modes, contract) {
  return Object.fromEntries(
    modes.map((mode) => {
      if (mode === "off") return [mode, ""];
      const modeRule = contract.modeRules[mode];
      if (typeof modeRule !== "string") {
        throw new Error(`Prompt contract has no rule for mode '${mode}'.`);
      }
      const label = mode === "wenyan" ? "wenyan-full" : mode;
      return [
        mode,
        `\n\nCAVEMAN MODE ACTIVE — level: ${label}\n${contract.commonRules}${modeRule}`,
      ];
    }),
  );
}

export function loadFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  if (!Array.isArray(fixtures.modes) || !Array.isArray(fixtures.categories)) {
    throw new Error("Evaluation fixture must define modes and categories.");
  }
  const promptContract = loadPromptContract();
  return {
    ...fixtures,
    promptContract,
    runtimePrompts: createRuntimePrompts(fixtures.modes, promptContract),
  };
}

function selectNamedItems(items, selection) {
  if (selection === undefined || selection.length === 0) return items;
  const requested = new Set(selection);
  const selected = items.filter((item) => requested.has(typeof item === "string" ? item : item.id));
  if (selected.length !== requested.size) {
    throw new Error("Evaluation selection contains an unknown mode or category.");
  }
  return selected;
}

function countWords(text) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length;
}

function scoreRequiredTerms(text, requiredTerms) {
  if (requiredTerms.length === 0) return 1;
  const retained = requiredTerms.filter((term) => text.includes(term)).length;
  return retained / requiredTerms.length;
}

const WORD_RATIO_LIMITS = {
  lite: 0.95,
  full: 0.85,
  ultra: 0.7,
  "wenyan-lite": 0.95,
  wenyan: 0.85,
  "wenyan-ultra": 0.7,
};

export async function countPromptTokens({
  apiKey,
  model,
  prompt,
  endpoint,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("Prompt token counting requires ANTHROPIC_API_KEY.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("Prompt token counting requires a model.");
  }
  if (typeof prompt !== "string") {
    throw new Error("Prompt token counting requires a prompt.");
  }
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("Prompt token counting requires a count endpoint.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Prompt token counting requires fetch support.");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      system: prompt,
      messages: [{ role: "user", content: "Count this prompt." }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Prompt token count failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (!Number.isInteger(payload.input_tokens) || payload.input_tokens < 0) {
    throw new Error("Prompt token count response did not contain input_tokens.");
  }
  return { model, inputTokens: payload.input_tokens };
}

function createRequestBody(model, modePrompt, category) {
  const body = {
    model,
    max_tokens: 1200,
    system: modePrompt,
    messages: [{ role: "user", content: category.prompt }],
  };
  if (category.expectsTool === true) {
    body.tools = [
      {
        name: "write_artifact",
        description: "Store requested persisted text.",
        input_schema: {
          type: "object",
          properties: { content: { type: "string" } },
          required: ["content"],
          additionalProperties: false,
        },
      },
    ];
    body.tool_choice = { type: "tool", name: "write_artifact" };
  }
  return body;
}

function extractResponseText(payload, expectsTool) {
  if (expectsTool) {
    const toolBlock = payload.content?.find((block) => block.type === "tool_use");
    if (typeof toolBlock?.input?.content !== "string") {
      throw new Error("Provider response did not contain write_artifact content.");
    }
    return { text: toolBlock.input.content, toolCallCount: 1 };
  }
  const text = payload.content?.find((block) => block.type === "text")?.text;
  if (typeof text !== "string") {
    throw new Error("Provider response did not contain a text block.");
  }
  return { text, toolCallCount: 0 };
}

export function createOfflineReport(fixtures = loadFixtures()) {
  const injectionLengths = Object.fromEntries(
    fixtures.modes.map((mode) => [mode, fixtures.runtimePrompts[mode].length]),
  );
  const matrix = fixtures.modes.flatMap((mode) =>
    fixtures.categories.map((category) => ({ mode, category: category.id })),
  );
  return {
    fixtureVersion: fixtures.version,
    provider: "offline",
    tokenAccounting: fixtures.promptContract?.tokenAccounting ?? {
      method: "provider-count-endpoint",
      endpointPath: "/v1/messages/count_tokens",
      status: "not-run",
      exactCountsByModel: {},
    },
    thresholds: {
      maxInjectionChars: 800,
      minimumRequiredTermRatio: 1,
      maximumLiteToOffWordRatio: 0.95,
      maximumFullToOffWordRatio: 0.85,
      maximumUltraToOffWordRatio: 0.7,
    },
    modes: fixtures.modes,
    categoryCount: fixtures.categories.length,
    caseCount: matrix.length,
    injectionLengths,
    matrix,
  };
}

export async function runProviderEvaluation(options) {
  const {
    apiKey,
    model,
    allowPaid,
    endpoint = "https://api.anthropic.com/v1/messages",
    fetchImpl = globalThis.fetch,
    fixtures = loadFixtures(),
    modes: modeSelection,
    categories: categorySelection,
    countTokens = false,
    countEndpoint,
  } = options;

  if (allowPaid !== true) {
    throw new Error("Provider evaluation requires explicit paid-run authorization.");
  }
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("Provider evaluation requires ANTHROPIC_API_KEY.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("Provider evaluation requires CAVEMAN_EVAL_MODEL.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Provider evaluation requires fetch support.");
  }

  const modes = selectNamedItems(fixtures.modes, modeSelection);
  const categories = selectNamedItems(fixtures.categories, categorySelection);
  const tokenAccounting = {
    method: "provider-count-endpoint",
    endpointPath: fixtures.promptContract?.tokenAccounting?.endpointPath ??
      "/v1/messages/count_tokens",
    status: countTokens === true ? "exact" : "not-run",
    model,
    totalRequestInputTokens: {},
    incrementalActiveMinusOffTokens: {},
    exactCounts: {},
  };
  if (countTokens === true) {
    const resolvedCountEndpoint =
      countEndpoint ?? new URL(tokenAccounting.endpointPath, endpoint).toString();
    const countModes = modes.includes("off") ? modes : ["off", ...modes];
    for (const mode of countModes) {
      const count = await countPromptTokens({
        apiKey,
        model,
        prompt: fixtures.runtimePrompts[mode] ?? "",
        endpoint: resolvedCountEndpoint,
        fetchImpl,
      });
      tokenAccounting.totalRequestInputTokens[mode] = count.inputTokens;
      tokenAccounting.exactCounts[mode] = count;
    }
    const offTokens = tokenAccounting.totalRequestInputTokens.off;
    for (const mode of modes) {
      if (mode === "off") continue;
      tokenAccounting.incrementalActiveMinusOffTokens[mode] =
        tokenAccounting.totalRequestInputTokens[mode] - offTokens;
      tokenAccounting.exactCounts[mode].incrementalInputTokens =
        tokenAccounting.incrementalActiveMinusOffTokens[mode];
    }
  }
  const results = [];

  for (const category of categories) {
    for (const mode of modes) {
      const startedAtMs = Date.now();
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(
          createRequestBody(model, fixtures.runtimePrompts[mode], category),
        ),
      });
      const elapsedMs = Date.now() - startedAtMs;
      if (!response.ok) {
        throw new Error(`Provider request failed with HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = await response.json();
      const extracted = extractResponseText(payload, category.expectsTool === true);
      results.push({
        mode,
        category: category.id,
        response: extracted.text,
        wordCount: countWords(extracted.text),
        requiredTermRatio: scoreRequiredTerms(
          extracted.text,
          category.requiredTerms ?? [],
        ),
        elapsedMs,
        toolCallCount: extracted.toolCallCount,
        usage: payload.usage ?? null,
      });
    }
  }

  const baselineWordCounts = new Map(
    results.filter((result) => result.mode === "off").map((result) => [result.category, result.wordCount]),
  );
  for (const result of results) {
    const baselineWordCount = baselineWordCounts.get(result.category);
    result.wordRatioToOff =
      baselineWordCount === undefined || baselineWordCount === 0
        ? null
        : result.wordCount / baselineWordCount;
    const ratioLimit = WORD_RATIO_LIMITS[result.mode];
    result.requiredTermsPassed = result.requiredTermRatio === 1;
    result.brevityPassed =
      ratioLimit === undefined || result.wordRatioToOff === null
        ? true
        : result.wordRatioToOff <= ratioLimit;
    result.passed = result.requiredTermsPassed && result.brevityPassed;
  }

  return {
    fixtureVersion: fixtures.version,
    provider: "anthropic",
    model,
    tokenAccounting,
    generatedAt: new Date().toISOString(),
    caseCount: results.length,
    passed: results.every((result) => result.passed),
    results,
  };
}

function parseList(value) {
  return value === undefined || value.trim().length === 0
    ? undefined
    : value.split(",").map((item) => item.trim());
}

async function main() {
  const fixtures = loadFixtures();
  const provider = process.env.CAVEMAN_EVAL_PROVIDER ?? "offline";
  const report =
    provider === "offline"
      ? createOfflineReport(fixtures)
      : await runProviderEvaluation({
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.CAVEMAN_EVAL_MODEL,
          allowPaid: process.env.CAVEMAN_EVAL_ALLOW_PAID === "1",
          endpoint: process.env.CAVEMAN_EVAL_ENDPOINT,
          fixtures,
          modes: parseList(process.env.CAVEMAN_EVAL_MODES),
          categories: parseList(process.env.CAVEMAN_EVAL_CATEGORIES),
          countTokens: process.env.CAVEMAN_EVAL_COUNT_TOKENS === "1",
          countEndpoint: process.env.CAVEMAN_EVAL_COUNT_ENDPOINT,
        });

  const serialized = JSON.stringify(report, null, 2) + "\n";
  const outputPath = process.env.CAVEMAN_EVAL_OUTPUT;
  if (outputPath === undefined || outputPath.length === 0) {
    process.stdout.write(serialized);
  } else {
    fs.writeFileSync(outputPath, serialized, "utf8");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
