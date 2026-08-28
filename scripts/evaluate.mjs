#!/usr/bin/env node

import * as crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
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

export const SUPPORTED_PROVIDERS = ["offline", "anthropic", "pi"];

export function validateProviderName(provider) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported CAVEMAN_EVAL_PROVIDER '${provider}'. Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }
  return provider;
}

// Pre-request run configuration checks. Shared by the API and the CLI so the
// same guard order runs before any paid call.
export function validateRunConfiguration({ modes, repetitions, plannedCalls, maxPaidCalls, commit }) {
  const activeModes = modes.filter((mode) => mode !== "off");
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("Repetitions must be a positive integer.");
  }
  if (activeModes.length > 0 && repetitions < 3) {
    throw new Error(
      `Comparative scoring requires at least three repetitions per pair; got ${repetitions}.`,
    );
  }
  if (maxPaidCalls !== undefined && plannedCalls > maxPaidCalls) {
    throw new Error(
      `Planned paid calls (${plannedCalls}) exceed the configured cap (${maxPaidCalls}).`,
    );
  }
  if (commit === null || commit === undefined) {
    throw new Error("Evaluation requires a Git commit SHA for the run record.");
  }
  return true;
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

function parseSeed(seedOption) {
  if (seedOption === undefined) return Math.floor(Math.random() * 0xffffffff);
  const text = String(seedOption).trim();
  const isHexSeed = /^(?:0x)?[0-9a-f]+$/i.test(text);
  if (!isHexSeed) {
    throw new Error(
      `CAVEMAN_EVAL_SEED '${seedOption}' is malformed. Supply a hexadecimal seed ` +
        "such as 0xa1b2c3d4, or omit the seed for a random one.",
    );
  }
  return Number.parseInt(text, 16) >>> 0;
}

function formatSeed(seed) {
  return `0x${seed.toString(16)}`;
}

function validatePricing(pricing) {
  if (pricing === undefined || pricing === null) return null;
  if (typeof pricing !== "object") {
    throw new Error("Pricing must be an object with per-million-token rates.");
  }
  const validated = {};
  for (const field of [
    "inputPerMTok",
    "outputPerMTok",
    "cacheWritePerMTok",
    "cacheReadPerMTok",
  ]) {
    const value = pricing[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Pricing field '${field}' must be a non-negative number.`);
    }
    validated[field] = value;
  }
  return validated;
}

function computeCostUsd(usage, pricing) {
  if (pricing === null) return null;
  // Cost needs every pricing-relevant field. A missing field must stay
  // missing: substituting zero would silently understate the run cost.
  if (
    usage.input === null ||
    usage.output === null ||
    usage.cacheWrite === null ||
    usage.cacheRead === null
  ) {
    return null;
  }
  const cost =
    (usage.input / 1e6) * pricing.inputPerMTok +
    (usage.output / 1e6) * pricing.outputPerMTok +
    (usage.cacheWrite / 1e6) * pricing.cacheWritePerMTok +
    (usage.cacheRead / 1e6) * pricing.cacheReadPerMTok;
  return Number(cost.toFixed(8));
}

function defaultExecGit() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(here, ".."),
    encoding: "utf8",
  }).trim();
}

function defaultReadPiVersion() {
  const candidate = path.resolve(here, "..", "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
  if (fs.existsSync(candidate)) {
    const version = JSON.parse(fs.readFileSync(candidate, "utf8")).version;
    if (typeof version === "string") return version;
  }
  return null;
}

function collectEnvironment({
  provider,
  runner,
  model,
  fixtureVersion,
  pricing,
  seed,
  execGit,
  commitOverride,
  readPiVersion,
}) {
  let commit = null;
  if (typeof commitOverride === "string" && commitOverride.length > 0) {
    commit = commitOverride;
  } else {
    const exec = execGit ?? defaultExecGit;
    try {
      commit = exec();
    } catch (error) {
      throw new Error(
        `Evaluation requires a Git commit SHA for the run record. git rev-parse HEAD failed ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          "Run from a checkout or set CAVEMAN_EVAL_COMMIT.",
      );
    }
  }
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    commit,
    piVersion: (readPiVersion ?? defaultReadPiVersion)(),
    provider,
    runner,
    model,
    fixtureVersion,
    pricing,
    seed,
    generatedAt: new Date().toISOString(),
  };
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean: Number(mean.toFixed(6)), median: Number(median.toFixed(6)), count: values.length };
}

function isPositiveIntegerOutput(value) {
  return Number.isInteger(value) && value > 0;
}

// A paired delta is only defined when both arms report the metric. Pairs with
// a missing side stay out of the statistic instead of contributing a zero.
function pairedDelta(pairs, read) {
  const values = pairs
    .map((pair) => ({ active: read(pair.active), off: read(pair.off) }))
    .filter((values) => typeof values.active === "number" && typeof values.off === "number")
    .map((values) => values.active - values.off);
  return stats(values);
}

function aggregatePairs(pairs, pricing, judgeEnabled) {
  const completePairs = pairs.filter(
    (pair) =>
      isPositiveIntegerOutput(pair.off.usage.output) &&
      isPositiveIntegerOutput(pair.active.usage.output),
  );
  const tokenRatios = completePairs.map(
    (pair) => pair.active.usage.output / pair.off.usage.output,
  );
  const judgeOk =
    judgeEnabled && pairs.every((pair) => pair.active.judge !== null && pair.active.judge.failed !== true);
  return {
    pairCount: pairs.length,
    completePairCount: completePairs.length,
    incompletePairCount: pairs.length - completePairs.length,
    outputTokenRatio: stats(tokenRatios),
    deltas: {
      inputTokens: pairedDelta(pairs, (result) => result.usage.input),
      cacheWriteTokens: pairedDelta(pairs, (result) => result.usage.cacheWrite),
      cacheReadTokens: pairedDelta(pairs, (result) => result.usage.cacheRead),
      outputTokens: pairedDelta(pairs, (result) => result.usage.output),
      costUsd:
        pricing === null
          ? null
          : pairedDelta(pairs, (result) => result.costUsd),
      latencyMs: pairedDelta(pairs, (result) => result.elapsedMs),
      qualityTotal: judgeOk
        ? stats(
            pairs.map(
              (pair) => pair.active.judge.activeQualityTotal - pair.active.judge.offQualityTotal,
            ),
          )
        : null,
    },
    validationPassed: pairs.every((pair) => pair.active.validation.passed),
    brevityPassed: pairs.every((pair) => pair.active.brevityPassed),
    qualityPassed: judgeEnabled
      ? pairs.every(
          (pair) =>
            pair.active.judge !== null &&
            pair.active.judge.failed !== true &&
            pair.active.qualityPassed,
        )
      : null,
  };
}

function aggregateResults(results, { pricing, judgeEnabled }) {
  const byMode = {};
  const byModeCategory = {};
  const offResults = new Map(
    results
      .filter((result) => result.mode === "off")
      .map((result) => [`${result.repetition}::${result.category}`, result]),
  );
  for (const activeMode of [...new Set(results.map((result) => result.mode))].filter((mode) => mode !== "off")) {
    const pairs = results
      .filter((result) => result.mode === activeMode)
      .map((result) => {
        const off = offResults.get(`${result.repetition}::${result.category}`);
        return off === undefined ? null : { off, active: result };
      })
      .filter((pair) => pair !== null);
    byMode[activeMode] = aggregatePairs(pairs, pricing, judgeEnabled);
    for (const category of [...new Set(pairs.map((pair) => pair.active.category))]) {
      byModeCategory[`${activeMode}::${category}`] = aggregatePairs(
        pairs.filter((pair) => pair.active.category === category),
        pricing,
        judgeEnabled,
      );
    }
  }
  return { byMode, byModeCategory };
}

function loadJudgeMaterials() {
  const promptText = fs.readFileSync(path.join(here, "eval", "judge-prompt.md"), "utf8");
  const rubricText = fs.readFileSync(path.join(here, "eval", "judge-rubric.md"), "utf8");
  return { promptText, rubricText };
}

export function parseJudgeVerdict(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("judge response contained no JSON object.");
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        const parsed = JSON.parse(text.substring(start, index + 1));
        const score = (arm) => {
          const completeness = parsed.completeness?.[arm];
          const correctness = parsed.correctness?.[arm];
          if (
            typeof completeness !== "number" ||
            typeof correctness !== "number" ||
            completeness < 0 ||
            completeness > 4 ||
            correctness < 0 ||
            correctness > 4
          ) {
            throw new Error(`judge scores for arm ${arm} are missing or out of range.`);
          }
          return { completeness, correctness, total: completeness + correctness };
        };
        return {
          A: score("A"),
          B: score("B"),
          notes: typeof parsed.notes === "string" ? parsed.notes : "",
        };
      }
    }
  }
  throw new Error("judge response JSON object was not closed.");
}

const TOKEN_RATIO_LIMITS = {
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

function hashToUint32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function derivePairSeed(seed, repetition, categoryId) {
  return (hashToUint32(`${seed}:${repetition}:${categoryId}`) ^ (seed >>> 0)) >>> 0;
}

function buildPlan({ modes, categories, repetitions, seed }) {
  const plan = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const category of categories) {
      const armOrder = createArmOrder(modes, derivePairSeed(seed, repetition, category.id));
      plan.push(
        ...armOrder.map((mode, armPosition) => ({
          repetition,
          category: category.id,
          mode,
          armPosition,
          key: `${repetition}::${category.id}::${mode}`,
        })),
      );
    }
  }
  return plan;
}

function normalizeUsage(usage) {
  if (usage === null || typeof usage !== "object") {
    return { input: null, output: null, cacheWrite: null, cacheRead: null };
  }
  const pick = (...keys) => {
    for (const key of keys) {
      if (typeof usage[key] === "number") return usage[key];
    }
    return null;
  };
  return {
    input: pick("input_tokens", "input"),
    output: pick("output_tokens", "output"),
    cacheWrite: pick("cache_creation_input_tokens", "cacheWrite", "cache_write"),
    cacheRead: pick("cache_read_input_tokens", "cacheRead", "cache_read"),
  };
}

export function loadPiBaseSystemPrompt() {
  const capturePath = path.join(here, "eval", "pi-base-system-prompt.json");
  const capture = JSON.parse(fs.readFileSync(capturePath, "utf8"));
  if (typeof capture.text !== "string" || capture.text.length === 0) {
    throw new Error(`Pi base system prompt capture at ${capturePath} has no text field.`);
  }
  return capture.text;
}

function buildSystemBlocks(baseSystemPrompt, cavemanText) {
  return [
    {
      type: "text",
      text: baseSystemPrompt,
      cache_control: { type: "ephemeral" },
    },
    ...(cavemanText.length > 0 ? [{ type: "text", text: cavemanText }] : []),
  ];
}

function createRequestBody({ model, systemBlocks, messages, category, metadata }) {
  const body = {
    model,
    max_tokens: 1200,
    system: systemBlocks,
    messages,
    metadata: { user_id: JSON.stringify(metadata) },
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
    provider = "anthropic",
    endpoint = "https://api.anthropic.com/v1/messages",
    fetchImpl = globalThis.fetch,
    fixtures = loadFixtures(),
    modes: modeSelection,
    categories: categorySelection,
    countTokens = false,
    countEndpoint,
    repetitions,
    seed: seedOption,
    pricing: pricingOption,
    maxPaidCalls,
    baseSystemPromptOption,
    checkpointPath,
    judge = false,
    judgeModel,
    judgeFetchImpl,
    spawnImpl,
    piBinOption,
    execGit,
    commitOverride,
    readPiVersion,
    nowImpl = Date.now,
    timeoutMs,
    maxAttempts,
    sleepImpl,
  } = options;

  if (checkpointPath !== undefined && seedOption === undefined) {
    throw new Error("Checkpointed evaluation requires an explicit seed for safe resume.");
  }
  if (allowPaid !== true) {
    throw new Error("Provider evaluation requires explicit paid-run authorization.");
  }
  validateProviderName(provider);
  if (provider !== "pi" && (typeof apiKey !== "string" || apiKey.length === 0)) {
    throw new Error("Provider evaluation requires ANTHROPIC_API_KEY.");
  }
  if (
    judge === true &&
    provider !== "pi" &&
    (typeof apiKey !== "string" || apiKey.length === 0)
  ) {
    throw new Error("Blinded judge evaluation requires ANTHROPIC_API_KEY.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("Provider evaluation requires CAVEMAN_EVAL_MODEL.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Provider evaluation requires fetch support.");
  }

  const modes = selectNamedItems(fixtures.modes, modeSelection);
  const categories = selectNamedItems(fixtures.categories, categorySelection);
  // Attempt guard: the paid cap bounds actual HTTP attempts, not logical
  // cases. Provider calls, judge calls, and token-count calls all draw from
  // the same budget, so a retried call consumes budget for every attempt.
  const attemptState = { provider: 0, judge: 0, countEndpoint: 0 };
  const paidAttempts = () =>
    attemptState.provider + attemptState.judge + attemptState.countEndpoint;
  const reservePaidAttempt = (kind) => {
    if (maxPaidCalls !== undefined && paidAttempts() >= maxPaidCalls) {
      throw new PaidCallBudgetExceededError(
        `paid-call budget exhausted: ${paidAttempts()} of ${maxPaidCalls} actual attempts spent, stopping before the next attempt. ` +
          "Rerun with a higher CAVEMAN_EVAL_MAX_PAID_CALLS or resume from the checkpoint.",
        { cap: maxPaidCalls, actualAttempts: paidAttempts() },
      );
    }
    attemptState[kind] += 1;
  };
  const guardPaidAttempt = (kind, baseFetch) => async (url, init) => {
    reservePaidAttempt(kind);
    return baseFetch(url, init);
  };
  const caseFetch = guardPaidAttempt("provider", fetchImpl);
  const judgeFetch = guardPaidAttempt("judge", judgeFetchImpl ?? fetchImpl);
  const countFetch = guardPaidAttempt("countEndpoint", fetchImpl);
  const activeModes = modes.filter((mode) => mode !== "off");
  if (activeModes.length > 0 && !modes.includes("off")) {
    throw new Error(
      `Comparative scoring requires the off baseline arm; selected modes: ${modes.join(", ")}. ` +
        "Add 'off' to the mode selection.",
    );
  }
  const repetitionCount = repetitions ?? 3;
  const pricing = validatePricing(pricingOption);
  const seed = parseSeed(seedOption);
  const plan = buildPlan({ modes, categories, repetitions: repetitionCount, seed });
  const runnerKind = provider === "pi" ? "pi" : "direct";
  const environment = collectEnvironment({
    provider,
    runner: runnerKind,
    model,
    fixtureVersion: fixtures.version,
    pricing,
    seed: formatSeed(seed),
    execGit,
    commitOverride,
    readPiVersion,
  });
  const plannedJudgeCalls =
    judge === true ? activeModes.length * categories.length * repetitionCount : 0;
  const plannedCountCalls =
    countTokens === true ? (modes.includes("off") ? modes.length : modes.length + 1) : 0;
  const plannedPaidCalls = plan.length + plannedJudgeCalls + plannedCountCalls;
  validateRunConfiguration({
    modes,
    repetitions: repetitionCount,
    plannedCalls: plannedPaidCalls,
    maxPaidCalls,
    commit: environment.commit,
  });
  const baseSystemPrompt = baseSystemPromptOption ?? loadPiBaseSystemPrompt();
  // Token counting runs only after every configuration check has passed, so
  // an invalid run can never issue a count request.
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
        fetchImpl: countFetch,
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

  const piRunner =
    runnerKind === "pi"
      ? createPiRunner({
          ...(piBinOption === undefined ? {} : { piBin: piBinOption }),
          extensionPath: path.resolve(here, "..", "index.ts"),
          model,
          spawnImpl: spawnImpl ?? defaultSpawn,
          timeoutMs,
          nowImpl,
        })
      : null;

  const runIdentity = {
    provider,
    endpoint,
    model,
    judge: judge === true,
    judgeModel: judge === true ? (judgeModel ?? model) : null,
    fixtureVersion: fixtures.version,
    commit: environment.commit,
    modes,
    categories: categories.map((category) => category.id),
    repetitions: repetitionCount,
    seed: formatSeed(seed),
    baseSystemPromptHash: crypto
      .createHash("sha256")
      .update(baseSystemPrompt)
      .digest("hex"),
    promptContractHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(fixtures.promptContract ?? null))
      .digest("hex"),
    runtimePromptHash: crypto
      .createHash("sha256")
      .update(modes.map((mode) => fixtures.runtimePrompts[mode] ?? "").join("\n---\n"))
      .digest("hex"),
  };
  const runId = `caveman-eval-${crypto
    .createHash("sha256")
    .update(JSON.stringify(runIdentity))
    .digest("hex")
    .substring(0, 16)}`;
  const checkpoint =
    checkpointPath !== undefined
      ? openCheckpoint({
          path: checkpointPath,
          runId,
          owner: { hostname: os.hostname(), pid: process.pid, heartbeatAtMs: nowImpl() },
          nowImpl,
        })
      : createMemoryCheckpoint(runId);

  const results = [];
  let seq = 0;
  for (const call of plan) {
    if (checkpoint.completed(call.key)) {
      results.push({ ...checkpoint.stored(call.key), seq: (seq += 1), resumed: true });
      continue;
    }
    const category = categories.find((item) => item.id === call.category);
    const cavemanText = fixtures.runtimePrompts[call.mode] ?? "";
    let payload = null;
    let executionExtras = {};
    if (piRunner !== null) {
      // One reserved provider attempt per Pi process, checked immediately
      // before the process starts. Retries inside the Pi process are not
      // observable here and are never claimed as counted attempts.
      try {
        reservePaidAttempt("provider");
      } catch (error) {
        checkpoint.recordFailure(
          call.key,
          error instanceof Error ? error.message : String(error),
        );
        throw new EvaluationAbortedError(
          `evaluation aborted at ${call.key}: ${error instanceof Error ? error.message : String(error)}`,
          {
            checkpointPath: checkpoint.path,
            completedCount: results.length,
            failedKey: call.key,
          },
        );
      }
      const piOutcome = await piRunner.execute({ mode: call.mode, category, repetition: call.repetition });
      payload = {
        content:
          piOutcome.toolCall === null
            ? [{ type: "text", text: piOutcome.text }]
            : [
                {
                  type: "tool_use",
                  name: piOutcome.toolCall.name,
                  input: piOutcome.toolCall.input,
                },
              ],
        usage: piOutcome.usage,
      };
      executionExtras = {
        attempts: 1,
        elapsedMs: piOutcome.elapsedMs,
        costUsd: piOutcome.costUsd ?? null,
        systemPromptSent: null,
        sessionId: null,
        toolCallCount: piOutcome.toolCallCount,
        rawUsage: piOutcome.rawUsage ?? null,
      };
    } else {
      const systemBlocks = buildSystemBlocks(baseSystemPrompt, cavemanText);
      const body = createRequestBody({
        model,
        systemBlocks,
        messages: [{ role: "user", content: category.prompt }],
        category,
        metadata: { repetition: call.repetition, category: call.category, mode: call.mode },
      });
      const startedAtMs = nowImpl();
      let outcome;
      try {
        outcome = await requestJsonWithRetry({
          url: endpoint,
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(body),
          fetchImpl: caseFetch,
          timeoutMs: timeoutMs ?? 120000,
          maxAttempts: maxAttempts ?? 3,
          sleepImpl,
          nowImpl,
        });
      } catch (error) {
        checkpoint.recordFailure(
          call.key,
          error instanceof Error ? error.message : String(error),
        );
        throw new EvaluationAbortedError(
          `evaluation aborted at ${call.key}: ${error instanceof Error ? error.message : String(error)}`,
          {
            checkpointPath: checkpoint.path,
            completedCount: results.length,
            failedKey: call.key,
          },
        );
      }
      payload = outcome.json;
      executionExtras = {
        attempts: outcome.attempts,
        elapsedMs: nowImpl() - startedAtMs,
        costUsd: null,
        systemPromptSent: systemBlocks.map((block) => block.text).join(""),
        sessionId: null,
        toolCallCount: null,
      };
    }
    const extracted = extractResponseText(payload, category.expectsTool === true);
    const usage = normalizeUsage(payload.usage);
    const costUsd =
      executionExtras.costUsd !== null && executionExtras.costUsd !== undefined
        ? executionExtras.costUsd
        : computeCostUsd(usage, pricing);
    const { runValidators } = await import("./eval/validators.mjs");
    const validatorConfigs = [
      ...(category.validators ?? []),
      ...((category.requiredTerms ?? []).length > 0 ? [{ id: "terms" }] : []),
    ];
    const validation = runValidators(extracted.text, validatorConfigs, {
      toolCall: extracted.toolCall,
      expectsTool: category.expectsTool === true,
      requiredTerms: category.requiredTerms ?? [],
    });
    const toolCallCount =
      executionExtras.toolCallCount !== null && executionExtras.toolCallCount !== undefined
        ? executionExtras.toolCallCount
        : extracted.toolCallCount;
    results.push({
      seq: (seq += 1),
      key: call.key,
      repetition: call.repetition,
      category: call.category,
      mode: call.mode,
      armPosition: call.armPosition,
      response: extracted.text,
      wordCount: countWords(extracted.text),
      requiredTermRatio: scoreRequiredTerms(extracted.text, category.requiredTerms ?? []),
      validation,
      usage,
      rawUsage: executionExtras.rawUsage ?? payload.usage ?? null,
      costUsd,
      elapsedMs: executionExtras.elapsedMs,
      attempts: executionExtras.attempts,
      toolCallCount,
      systemPromptSent: executionExtras.systemPromptSent,
      sessionId: executionExtras.sessionId,
      judge: null,
      tokenRatioToOff: null,
      wordRatioToOff: null,
      brevityPassed: true,
      qualityPassed: true,
      passed: false,
    });
    checkpoint.recordCall(call.key, results[results.length - 1]);
  }

  const offByPair = new Map(
    results
      .filter((result) => result.mode === "off")
      .map((result) => [`${result.repetition}::${result.category}`, result]),
  );
  const judgeResultsByKey = new Map();
  let judgeFailures = 0;
  if (judge === true) {
    if (activeModes.length === 0) {
      throw new Error("The blinded judge requires paired off and active arms.");
    }
    const judgeClient = async ({ system, user }) => {
      if (piRunner !== null) {
        // One reserved shared-cap judge attempt per Pi judge process,
        // checked immediately before the process starts. Retries inside the
        // Pi process are not observable here and are never counted.
        reservePaidAttempt("judge");
        return piRunner.executeJudge({ system, user, model: judgeModel });
      }
      const outcome = await requestJsonWithRetry({
        url: endpoint,
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: judgeModel ?? model,
          max_tokens: 500,
          system,
          messages: [{ role: "user", content: user }],
        }),
        fetchImpl: judgeFetch,
        timeoutMs: timeoutMs ?? 120000,
        maxAttempts: maxAttempts ?? 3,
        sleepImpl,
        nowImpl,
      });
      const text = outcome.json.content?.find((block) => block.type === "text")?.text ?? "";
      return {
        text,
        usage: normalizeUsage(outcome.json.usage),
        rawUsage: outcome.json.usage ?? null,
      };
    };
    const { promptText, rubricText } = loadJudgeMaterials();
    for (const result of results) {
      if (result.mode === "off") continue;
      const off = offByPair.get(`${result.repetition}::${result.category}`);
      if (off === undefined) continue;
      const judgeKey = `judge::${result.key}`;
      if (checkpoint.completed(judgeKey)) {
        judgeResultsByKey.set(result.key, checkpoint.stored(judgeKey));
        continue;
      }
      checkpoint.touchHeartbeat();
      const offIsA = mulberry32(derivePairSeed(seed, result.repetition, `judge:${result.category}:${result.mode}`))() < 0.5;
      const user = [
        `Task prompt:\n${categories.find((item) => item.id === result.category).prompt}`,
        `Response A:\n${offIsA ? off.response : result.response}`,
        `Response B:\n${offIsA ? result.response : off.response}`,
      ].join("\n\n---\n\n");
      let judgeResult;
      try {
        const outcome = await judgeClient({ system: `${promptText}\n\n${rubricText}`, user });
        const verdict = parseJudgeVerdict(outcome.text);
        const offScore = offIsA ? verdict.A : verdict.B;
        const activeScore = offIsA ? verdict.B : verdict.A;
        judgeResult = {
          failed: false,
          assignment: { A: offIsA ? "off" : result.mode, B: offIsA ? result.mode : "off" },
          verdict,
          offQualityTotal: offScore.total,
          activeQualityTotal: activeScore.total,
          notes: verdict.notes,
          usage: outcome.usage,
          rawUsage: outcome.rawUsage ?? null,
        };
      } catch (error) {
        if (error instanceof PaidCallBudgetExceededError) {
          checkpoint.recordFailure(judgeKey, error.message);
          throw new EvaluationAbortedError(
            `evaluation aborted during judge for ${result.key}: ${error.message}`,
            {
              checkpointPath: checkpoint.path,
              completedCount: results.length,
              failedKey: result.key,
            },
          );
        }
        judgeResult = {
          failed: true,
          error: error instanceof Error ? error.message : String(error),
          assignment: { A: offIsA ? "off" : result.mode, B: offIsA ? result.mode : "off" },
        };
      }
      if (judgeResult.failed === true) judgeFailures += 1;
      checkpoint.recordCall(judgeKey, judgeResult);
      judgeResultsByKey.set(result.key, judgeResult);
    }
  }

  const tolerance = 0;
  for (const result of results) {
    result.requiredTermsPassed = result.requiredTermRatio === 1;
    const off = offByPair.get(`${result.repetition}::${result.category}`);
    if (result.mode !== "off" && off !== undefined) {
      // An output ratio requires positive integer output usage in both arms.
      // Missing or invalid output usage fails brevity fail-closed instead of
      // silently passing on an undefined ratio.
      const ratioInputsValid =
        isPositiveIntegerOutput(off.usage.output) &&
        isPositiveIntegerOutput(result.usage.output);
      result.tokenRatioToOff = ratioInputsValid
        ? result.usage.output / off.usage.output
        : null;
      result.wordRatioToOff =
        off.wordCount > 0 ? result.wordCount / off.wordCount : null;
      const ratioLimit = TOKEN_RATIO_LIMITS[result.mode];
      result.brevityPassed =
        ratioLimit === undefined
          ? true
          : result.tokenRatioToOff !== null && result.tokenRatioToOff <= ratioLimit;
    }
    const judgeResult = result.mode === "off" ? null : judgeResultsByKey.get(result.key) ?? null;
    result.judge = judgeResult;
    if (judge === true && result.mode !== "off") {
      result.qualityPassed =
        judgeResult !== null &&
        judgeResult.failed !== true &&
        judgeResult.activeQualityTotal >= judgeResult.offQualityTotal - tolerance;
    }
    result.validationPassed = result.validation.passed;
    result.passed = result.validationPassed && result.brevityPassed && result.qualityPassed;
  }

  return {
    schemaVersion: 2,
    fixtureVersion: fixtures.version,
    provider,
    runner: runnerKind,
    model,
    tokenAccounting,
    judge: { enabled: judge === true, model: judge === true ? (judgeModel ?? model) : null, tolerance },
    pricing,
    seed: formatSeed(seed),
    runId,
    runIdentity,
    generatedAt: new Date().toISOString(),
    environment,
    repetitions: repetitionCount,
    modes,
    categories: categories.map((category) => category.id),
    plannedCalls: plannedPaidCalls,
    plannedProviderCalls: plan.length,
    plannedJudgeCalls,
    paidCallAccounting: {
      cap: maxPaidCalls ?? null,
      planned: {
        provider: plan.length,
        judge: plannedJudgeCalls,
        countEndpoint: plannedCountCalls,
        total: plannedPaidCalls,
      },
      actual: {
        provider: attemptState.provider,
        judge: attemptState.judge,
        countEndpoint: attemptState.countEndpoint,
        total: paidAttempts(),
      },
    },
    caseCount: results.length,
    runOrder: results.map((result) => ({
      seq: result.seq,
      key: result.key,
      repetition: result.repetition,
      category: result.category,
      mode: result.mode,
      armPosition: result.armPosition,
      resumed: result.resumed === true,
    })),
    results,
    aggregates: aggregateResults(results, { judgeEnabled: judge === true, pricing }),
    failures: checkpoint.state.failures,
    judgeFailures,
    // Primary usage completeness gates the whole run: every result, off arms
    // included, must report positive integer output usage.
    primaryUsageComplete: results.every((result) => isPositiveIntegerOutput(result.usage.output)),
    passed:
      results.every((result) => result.passed) &&
      judgeFailures === 0 &&
      results.every((result) => isPositiveIntegerOutput(result.usage.output)),
  };
}

function parseList(value) {
  return value === undefined || value.trim().length === 0
    ? undefined
    : value.split(",").map((item) => item.trim());
}

function parseIntegerEnvironment(name, value, minimum = 1) {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function parseJsonEnvironment(name, value) {
  if (value === undefined || value.trim().length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON.`, { cause: error });
  }
}

function readBaseSystemPromptEnvironment() {
  const inlinePrompt = process.env.CAVEMAN_EVAL_BASE_SYSTEM_PROMPT;
  const promptFile = process.env.CAVEMAN_EVAL_BASE_SYSTEM_PROMPT_FILE;
  if (inlinePrompt !== undefined && promptFile !== undefined) {
    throw new Error(
      "Set only one of CAVEMAN_EVAL_BASE_SYSTEM_PROMPT or CAVEMAN_EVAL_BASE_SYSTEM_PROMPT_FILE.",
    );
  }
  if (promptFile !== undefined && promptFile.length > 0) {
    return fs.readFileSync(promptFile, "utf8");
  }
  return inlinePrompt;
}

export async function requestJsonWithRetry(options) {
  const {
    url,
    headers,
    body,
    fetchImpl,
    timeoutMs = 120000,
    maxAttempts = 3,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    nowImpl = Date.now,
  } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      // Budget stops are not request failures: retrying would re-check the
      // same exhausted budget and mislabel the abort as an attempt failure.
      if (error instanceof PaidCallBudgetExceededError) {
        throw error;
      }
      if (attempt === maxAttempts) {
        throw new TerminalRequestError(
          `request failed on attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
          { status: null, body: null, attempts: attempt, cause: error },
        );
      }
      await sleepImpl(backoffDelayMs(attempt));
      continue;
    }
    clearTimeout(timeoutHandle);
    if (response.ok) {
      const json = await response.json();
      return { status: response.status, json, attempts: attempt };
    }
    const responseText = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new TerminalRequestError(
        `provider request failed with HTTP ${response.status}: ${responseText}`,
        { status: response.status, body: responseText, attempts: attempt },
      );
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs =
      retryAfterHeader !== null && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader) * 1000
        : backoffDelayMs(attempt);
    await sleepImpl(Math.min(retryAfterMs, 60000));
  }
  throw new Error("requestJsonWithRetry exhausted attempts without an outcome.");
}

function backoffDelayMs(attempt) {
  return Math.min(500 * 2 ** (attempt - 1), 8000);
}

export class TerminalRequestError extends Error {
  constructor(message, info) {
    super(message, info.cause === undefined ? undefined : { cause: info.cause });
    this.name = "TerminalRequestError";
    this.status = info.status ?? null;
    this.body = info.body ?? null;
    this.attempts = info.attempts ?? 1;
  }
}

export class EvaluationAbortedError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "EvaluationAbortedError";
    this.checkpointPath = info.checkpointPath ?? null;
    this.completedCount = info.completedCount ?? 0;
    this.failedKey = info.failedKey ?? null;
  }
}

// Raised before an HTTP attempt would exceed the configured paid-call cap.
export class PaidCallBudgetExceededError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "PaidCallBudgetExceededError";
    this.cap = info.cap ?? null;
    this.actualAttempts = info.actualAttempts ?? 0;
  }
}

// Deterministic PRNG (mulberry32). Stored seeds make arm order reproducible.
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createArmOrder(arms, seed) {
  const random = mulberry32(seed);
  const order = [...arms];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  return order;
}

// Incremental checkpoint store. Each completed paid call is persisted with an
// atomic temp-file rename so an interrupted run resumes without repeating it.
export function openCheckpoint({
  path: checkpointPath,
  runId,
  owner,
  nowImpl = Date.now,
  staleAfterMs = 300000,
  isProcessAlive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
}) {
  let state = { runId, completedCalls: {}, runOrder: [], failures: [] };
  if (owner !== undefined && !fs.existsSync(checkpointPath)) {
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    const initialState = { ...state, owner };
    try {
      fs.writeFileSync(checkpointPath, JSON.stringify(initialState, null, 2) + "\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  if (fs.existsSync(checkpointPath)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    } catch (error) {
      throw new Error(
        `checkpoint at ${checkpointPath} is corrupt and cannot be parsed ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          "Move it aside or delete it, then rerun to rebuild progress.",
      );
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.runId !== "string" ||
      typeof parsed.completedCalls !== "object" ||
      parsed.completedCalls === null
    ) {
      throw new Error(
        `checkpoint at ${checkpointPath} is corrupt (missing runId or completedCalls). ` +
          "Move it aside or delete it, then rerun to rebuild progress.",
      );
    }
    if (parsed.runId !== runId) {
      throw new Error(
        `checkpoint at ${checkpointPath} belongs to run '${parsed.runId}', refusing to overwrite for run '${runId}'.`,
      );
    }
    const recordedOwner = parsed.owner;
    if (
      owner !== undefined &&
      recordedOwner !== undefined &&
      recordedOwner.pid !== owner.pid &&
      recordedOwner.hostname === owner.hostname &&
      nowImpl() - recordedOwner.heartbeatAtMs < staleAfterMs &&
      isProcessAlive(recordedOwner.pid)
    ) {
      throw new Error(
        `checkpoint at ${checkpointPath} is owned by live process ${recordedOwner.pid}; refusing concurrent resume.`,
      );
    }
    state = parsed;
  }
  if (owner !== undefined) {
    state.owner = owner;
  }
  function persist() {
    const directory = path.dirname(checkpointPath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = path.join(directory, `.${path.basename(checkpointPath)}.${runId}.tmp`);
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tempPath, checkpointPath);
  }
  persist();
  return {
    runId,
    completed(key) {
      return Object.prototype.hasOwnProperty.call(state.completedCalls, key);
    },
    stored(key) {
      return state.completedCalls[key];
    },
    recordCall(key, result) {
      state.completedCalls[key] = result;
      if (!state.runOrder.includes(key)) {
        state.runOrder.push(key);
      }
      persist();
    },
    recordFailure(key, error) {
      state.failures.push({ key, error, at: new Date().toISOString() });
      persist();
    },
    touchHeartbeat() {
      if (state.owner !== undefined) {
        state.owner.heartbeatAtMs = nowImpl();
        persist();
      }
    },
    state,
  };
}

function createMemoryCheckpoint(runId) {
  const state = { runId, completedCalls: {}, runOrder: [], failures: [] };
  return {
    runId,
    path: null,
    completed: (key) => Object.prototype.hasOwnProperty.call(state.completedCalls, key),
    stored: (key) => state.completedCalls[key],
    recordCall: (key, result) => {
      state.completedCalls[key] = result;
      if (!state.runOrder.includes(key)) state.runOrder.push(key);
    },
    recordFailure: (key, error) => {
      state.failures.push({ key, error, at: new Date().toISOString() });
    },
    touchHeartbeat: () => {},
    state,
  };
}

// Pi runner adapter. Executes a case through the real Pi CLI in documented
// JSON mode with the extension loaded. Every call is single-turn and carries
// an isolated CAVEMAN_MILK_CONFIG_DIR holding the mode config, so the user's
// own config is never read or written and no session context accumulates.
// The blinded judge runs through the same session path: the committed judge
// prompt plus rubric becomes the Pi system prompt, only the blinded task and
// responses travel as user content, mode is always off, and no tools are
// offered so the judge can only reply with verdict text.
// Production use passes a real spawn; tests inject a fake so no provider
// call happens.
export function createPiRunner({
  piBin = path.resolve(
    here,
    "..",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "bundle",
    "cli.js",
  ),
  extensionPath,
  toolExtensionPath = path.resolve(here, "eval", "pi-eval-tool.ts"),
  model,
  spawnImpl = defaultSpawn,
  timeoutMs = 300000,
  nowImpl = Date.now,
  mkdtempImpl = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  baseEnv = process.env,
}) {
  // Shared single-turn Pi session: isolated config directory holding the
  // requested mode, exactly one spawned process, documented JSON event
  // parsing, and best-effort directory removal in a finally block.
  async function runPiSession({ mode, args }) {
    const configDir = mkdtempImpl("caveman-pi-config-");
    fs.writeFileSync(
      path.join(configDir, "caveman-milk-pi.json"),
      JSON.stringify({ schemaVersion: 1, mode, showStatus: false }, null, 2) + "\n",
      { mode: 0o600 },
    );
    try {
      const startedAtMs = nowImpl();
      const result = await spawnImpl(args, {
        env: { ...baseEnv, CAVEMAN_MILK_CONFIG_DIR: configDir },
        timeout: timeoutMs,
      });
      const elapsedMs = nowImpl() - startedAtMs;
      if (result.code !== 0) {
        throw new Error(
          `pi runner exited with code ${result.code}: ${(result.stderr ?? "").substring(0, 500)}`,
        );
      }
      let text = "";
      let toolCall = null;
      let toolCallCount = 0;
      let usage = { input: null, output: null, cacheWrite: null, cacheRead: null };
      let rawUsage = null;
      let costUsd = null;
      for (const line of (result.stdout ?? "").split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (event.type === "tool_execution_start") {
          toolCallCount += 1;
          if (event.toolName === "write_artifact") {
            toolCall = { name: event.toolName, input: event.args };
          }
        }
        if (event.type === "message_end" && event.message?.role === "assistant") {
          const message = event.message;
          text = (message.content ?? [])
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
          if (message.usage !== undefined && message.usage !== null) {
            usage = normalizeUsage(message.usage);
            rawUsage = message.usage;
            if (message.usage.cost && typeof message.usage.cost.total === "number") {
              costUsd = message.usage.cost.total;
            }
          }
        }
      }
      return { text, toolCall, toolCallCount, usage, rawUsage, costUsd, elapsedMs };
    } finally {
      // Best-effort cleanup: a locked file must not fail the finished call.
      try {
        fs.rmSync(configDir, { recursive: true, force: true });
      } catch {
        // Leave the temp directory for the operating system to reap.
      }
    }
  }
  return {
    async execute({ mode, category }) {
      const args = [
        piBin,
        "--mode",
        "json",
        "--no-extensions",
        "--no-skills",
        "--no-context-files",
        "--no-prompt-templates",
        "-e",
        extensionPath,
        "-e",
        toolExtensionPath,
        "--model",
        model,
        "-p",
        category.prompt,
      ];
      const session = await runPiSession({ mode, args });
      if (session.text.length === 0) {
        throw new Error("pi runner produced no assistant text for the case.");
      }
      return { ...session, attempts: 1, systemPromptSent: null, sessionId: null };
    },
    // Blinded judge session: system prompt is the committed judge prompt
    // plus rubric, user content is the blinded task and responses only, the
    // caveman extension runs with mode off, and tools stay disabled.
    async executeJudge({ system, user, model: judgeModel }) {
      const args = [
        piBin,
        "--mode",
        "json",
        "--no-extensions",
        "--no-skills",
        "--no-context-files",
        "--no-prompt-templates",
        "--no-tools",
        "-e",
        extensionPath,
        "--system-prompt",
        system,
        "--model",
        judgeModel ?? model,
        "-p",
        user,
      ];
      const session = await runPiSession({ mode: "off", args });
      if (session.text.length === 0) {
        throw new Error("pi runner produced no assistant text for the judge.");
      }
      return { text: session.text, usage: session.usage, rawUsage: session.rawUsage };
    },
  };
}

function defaultSpawn(args, options) {
  return new Promise((resolve, reject) => {
    const [command, ...commandArgs] = args;
    // JavaScript entry points cannot be executed directly on Windows, and
    // shell shims in .bin are not portable either. Route them through the
    // current node executable so the same piBin value works everywhere.
    const isJavaScriptEntryPoint = /\.(js|mjs|cjs)$/.test(command);
    const child = isJavaScriptEntryPoint
      ? nodeSpawn(process.execPath, [command, ...commandArgs], options)
      : nodeSpawn(command, commandArgs, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function main() {
  const fixtures = loadFixtures();
  const provider = process.env.CAVEMAN_EVAL_PROVIDER ?? "offline";
  validateProviderName(provider);
  const allowPaid = process.env.CAVEMAN_EVAL_ALLOW_PAID === "1";
  const maxPaidCalls = parseIntegerEnvironment(
    "CAVEMAN_EVAL_MAX_PAID_CALLS",
    process.env.CAVEMAN_EVAL_MAX_PAID_CALLS,
  );
  if (provider !== "offline" && allowPaid && maxPaidCalls === undefined) {
    throw new Error("Paid evaluation requires CAVEMAN_EVAL_MAX_PAID_CALLS.");
  }
  const report =
    provider === "offline"
      ? createOfflineReport(fixtures)
      : await runProviderEvaluation({
          provider,
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.CAVEMAN_EVAL_MODEL,
          allowPaid,
          endpoint: process.env.CAVEMAN_EVAL_ENDPOINT,
          fixtures,
          modes: parseList(process.env.CAVEMAN_EVAL_MODES),
          categories: parseList(process.env.CAVEMAN_EVAL_CATEGORIES),
          countTokens: process.env.CAVEMAN_EVAL_COUNT_TOKENS === "1",
          countEndpoint: process.env.CAVEMAN_EVAL_COUNT_ENDPOINT,
          repetitions: parseIntegerEnvironment(
            "CAVEMAN_EVAL_REPETITIONS",
            process.env.CAVEMAN_EVAL_REPETITIONS,
          ),
          seed: process.env.CAVEMAN_EVAL_SEED,
          pricing: parseJsonEnvironment(
            "CAVEMAN_EVAL_PRICING",
            process.env.CAVEMAN_EVAL_PRICING,
          ),
          maxPaidCalls,
          baseSystemPromptOption: readBaseSystemPromptEnvironment(),
          checkpointPath: process.env.CAVEMAN_EVAL_CHECKPOINT,
          judge: process.env.CAVEMAN_EVAL_JUDGE === "1",
          judgeModel: process.env.CAVEMAN_EVAL_JUDGE_MODEL,
          piBinOption: process.env.CAVEMAN_EVAL_PI_BIN,
          commitOverride: process.env.CAVEMAN_EVAL_COMMIT,
          timeoutMs: parseIntegerEnvironment(
            "CAVEMAN_EVAL_TIMEOUT_MS",
            process.env.CAVEMAN_EVAL_TIMEOUT_MS,
          ),
          maxAttempts: parseIntegerEnvironment(
            "CAVEMAN_EVAL_MAX_ATTEMPTS",
            process.env.CAVEMAN_EVAL_MAX_ATTEMPTS,
          ),
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
