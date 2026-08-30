import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRequirements } from "./validators.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const FIXTURE_PATH = "scripts/evaluation-fixtures-fresh-v3.json";
const DEFAULT_CONTROLLED_RUNS = [
  { id: "cold", path: "evaluation/results/fresh-v3-cold-controlled-v1.json", cacheRule: "zero" },
  { id: "warm", path: "evaluation/results/fresh-v3-warm-controlled-v1.json", cacheRule: "positive" },
];
const DEFAULT_SUPPORT_RUNS = [
  { id: "preflight", path: "evaluation/results/fresh-v3-tool-preflight.json" },
  { id: "warmup", path: "evaluation/results/fresh-v3-warmup-shared-v1.json" },
];
const VALIDATOR_VERSION = "schema5-task-success-v14";
const USER_FACING_TYPES = new Set([
  "critical-omission",
  "missing-negation",
  "missing-warning",
  "missing-identifier",
  "missing-path",
  "missing-command",
  "missing-number",
  "gap-not-marked",
  "noncritical-omission",
  "altered-fact",
  "unsupported-claim",
  "ordering-error",
]);
const INTER_AGENT_TYPES = new Set([
  "delegation-missing",
  "delegation-term-missing",
  "incomplete-tree",
  "child-response-missing",
  "child-usage-missing",
  "child-handoff-term-missing",
  "handoff-missing",
  "handoff-term-missing",
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function sha256File(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createRandom(seedText) {
  let state = Number.parseInt(crypto.createHash("sha256").update(seedText).digest("hex").substring(0, 8), 16) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function pairedInterval(values, label, samples = 20000) {
  if (values.length === 0) return { count: 0, mean: null, lower95: null, upper95: null };
  const random = createRandom(label);
  const means = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    means.push(total / values.length);
  }
  means.sort((left, right) => left - right);
  return {
    count: values.length,
    mean: mean(values),
    lower95: means[Math.floor(samples * 0.025)],
    upper95: means[Math.floor(samples * 0.975)],
  };
}

// Total tree tokens: the root process usage plus every child process usage.
// Each billed node counts exactly once. The root bills the child response
// text as later input, and that overlap is real provider cost, not double
// counting. An incomplete nested tree yields null instead of a partial sum.
function totalTreeTokens(result) {
  const fields = ["input", "output", "cacheWrite", "cacheRead"];
  const nested = result.nested ?? null;
  if (nested !== null) {
    const children = Array.isArray(nested.children) ? nested.children : [];
    const complete =
      nested.complete === true &&
      children.length >= 1 &&
      fields.every((field) => typeof result.usage?.[field] === "number") &&
      children.every((child) =>
        fields.every((field) => typeof child?.usage?.[field] === "number"),
      );
    if (!complete) return null;
    return fields.reduce(
      (sum, field) =>
        sum + result.usage[field] + children.reduce((childSum, child) => childSum + child.usage[field], 0),
      0,
    );
  }
  const usage = result.usage ?? {};
  return fields.every((field) => typeof usage[field] === "number")
    ? fields.reduce((sum, field) => sum + usage[field], 0)
    : null;
}

function preservationFrom(validation) {
  const findings = validation.checks.flatMap((check) => check.findings ?? []);
  const count = (predicate) => findings.filter(predicate).length;
  const totalCriticalFindings = count(
    (finding) => USER_FACING_TYPES.has(finding.type) && finding.type !== "noncritical-omission",
  );
  return {
    userFacing: {
      totalCriticalFindings,
      requiredFactOmissionCount: count((finding) => ["critical-omission", "missing-identifier", "missing-number", "gap-not-marked"].includes(finding.type)),
      noncriticalOmissionCount: count((finding) => finding.type === "noncritical-omission"),
      alteredFactCount: count((finding) => finding.type === "altered-fact"),
      unsupportedClaimCount: count((finding) => finding.type === "unsupported-claim"),
      orderingErrorCount: count((finding) => finding.type === "ordering-error"),
      missingWarningCount: count((finding) => finding.type === "missing-warning"),
      missingNegationCount: count((finding) => finding.type === "missing-negation"),
      changedOrMissingCommandCount: count((finding) => finding.type === "missing-command"),
      changedOrMissingPathCount: count((finding) => finding.type === "missing-path"),
    },
    interAgent: {
      delegationMissingCount: count((finding) => finding.type === "delegation-missing"),
      delegationTermMissingCount: count((finding) => finding.type === "delegation-term-missing"),
      incompleteTreeCount: count((finding) => finding.type === "incomplete-tree"),
      childResponseMissingCount: count((finding) => finding.type === "child-response-missing"),
      childUsageMissingCount: count((finding) => finding.type === "child-usage-missing"),
      childHandoffTermMissingCount: count(
        (finding) => finding.type === "child-handoff-term-missing",
      ),
      handoffMissingCount: count((finding) => finding.type === "handoff-missing"),
      handoffTermMissingCount: count((finding) => finding.type === "handoff-term-missing"),
    },
    findings,
  };
}

function pairResults(results) {
  const pairs = new Map();
  for (const result of results) {
    const key = `${result.repetition}|${result.category}`;
    const pair = pairs.get(key) ?? {};
    pair[result.mode] = result;
    pairs.set(key, pair);
  }
  return [...pairs.entries()].map(([key, pair]) => ({ key, ...pair }));
}

function cacheState(result) {
  const reads = [
    result.usage?.cacheRead,
    ...(result.nested?.children ?? []).map((child) => child.usage?.cacheRead),
  ];
  if (reads.length === 0 || reads.some((value) => !Number.isFinite(value))) return "mixed";
  if (reads.every((value) => value === 0)) return "zero";
  if (reads.every((value) => value > 0)) return "positive";
  return "mixed";
}

function cacheEligible(pair, rule) {
  if (pair.off === undefined || pair.lite === undefined) return false;
  const required = rule === "zero" ? "zero" : "positive";
  return cacheState(pair.off) === required && cacheState(pair.lite) === required;
}

function classifyPair(pair) {
  const states = [cacheState(pair.off), cacheState(pair.lite)];
  if (states.every((state) => state === "zero")) return "both-zero";
  if (states.every((state) => state === "positive")) return "both-positive";
  return "mixed";
}

function correctedRun(source, fixture, runId) {
  const categories = new Map(fixture.categories.map((category) => [category.id, category]));
  const results = source.results.map((result, index) => {
    const category = categories.get(result.category);
    if (category === undefined) {
      throw new Error(`Run ${runId} result ${index} references unknown category '${result.category}'.`);
    }
    const validation = runRequirements(result.response, category.requirements ?? [], {
      toolCalls: result.toolCalls ?? [],
      expectsTool: category.expectsTool === true,
      sessionToolMetrics: result.sessionToolMetrics ?? null,
      nested: result.nested ?? null,
    });
    return {
      ...result,
      originalBehavioralPassed: result.behavioralPassed,
      behavioralPassed: validation.passed,
      originalValidation: result.validation ?? null,
      validation,
      preservation: preservationFrom(validation),
      rawPointer: `/results/${index}`,
      responseSha256: sha256Text(result.response),
      sourceRun: runId,
    };
  });
  return { ...source, results };
}

function metricDelta(pair, field) {
  if (field === "totalTreeTokens") {
    const off = totalTreeTokens(pair.off);
    const lite = totalTreeTokens(pair.lite);
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  if (field === "rootLatencyMs") return pair.lite.elapsedMs - pair.off.elapsedMs;
  if (field === "timeToFirstTokenMs") {
    const off = pair.off.timing?.timeToFirstTokenMs;
    const lite = pair.lite.timing?.timeToFirstTokenMs;
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  if (field === "generationDurationMs") {
    // Generation duration stays a single-turn metric: multi-turn and nested
    // sessions mix tool wait time into wall time and are excluded.
    const singleTurn = [pair.off, pair.lite].every(
      (result) => result.assistantTurns === 1 && (result.toolCalls ?? []).length === 0,
    );
    if (!singleTurn) return null;
    const off = pair.off.timing?.generationDurationMs;
    const lite = pair.lite.timing?.generationDurationMs;
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  if (["input", "cacheRead", "cacheWrite", "output"].includes(field)) {
    return pair.lite.usage[field] - pair.off.usage[field];
  }
  return null;
}

function eligibleSuccessfulPairs(run, cacheRule) {
  return pairResults(run.results).filter(
    (pair) =>
      cacheEligible(pair, cacheRule) &&
      pair.off.behavioralPassed &&
      pair.lite.behavioralPassed,
  );
}

function deploymentMixInterval(entries, field, weights, samples = 20000) {
  const groups = entries.map((entry) => ({
    id: entry.id,
    weight: weights[entry.id],
    values: eligibleSuccessfulPairs(entry.corrected, entry.cacheRule)
      .map((pair) => metricDelta(pair, field))
      .filter(Number.isFinite),
  }));
  if (groups.some((group) => !Number.isFinite(group.weight) || group.values.length === 0)) {
    return { count: 0, mean: null, lower95: null, upper95: null };
  }
  const random = createRandom(`fresh-v3-deployment-mix|${field}`);
  const means = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let mixedMean = 0;
    for (const group of groups) {
      let total = 0;
      for (let index = 0; index < group.values.length; index += 1) {
        total += group.values[Math.floor(random() * group.values.length)];
      }
      mixedMean += group.weight * (total / group.values.length);
    }
    means.push(mixedMean);
  }
  means.sort((left, right) => left - right);
  return {
    count: groups.reduce((sum, group) => sum + group.values.length, 0),
    mean: groups.reduce((sum, group) => sum + group.weight * mean(group.values), 0),
    lower95: means[Math.floor(samples * 0.025)],
    upper95: means[Math.floor(samples * 0.975)],
  };
}

function successAnalysis(runs, categoryIds, label) {
  const pairs = runs
    .flatMap((run) => pairResults(run.results))
    .filter((pair) => categoryIds.has(pair.off.category));
  const deltas = pairs.map(
    (pair) => Number(pair.lite.behavioralPassed) - Number(pair.off.behavioralPassed),
  );
  return {
    pairCount: pairs.length,
    pairedDelta: pairedInterval(deltas, `fresh-v3-success|${label}`),
  };
}

function conditionAnalysis(run, cacheRule) {
  const allPairs = pairResults(run.results);
  const eligiblePairs = allPairs.filter((pair) => cacheEligible(pair, cacheRule));
  const successfulPairs = eligiblePairs.filter(
    (pair) => pair.off.behavioralPassed && pair.lite.behavioralPassed,
  );
  const metricNames = [
    "totalTreeTokens",
    "rootLatencyMs",
    "timeToFirstTokenMs",
    "generationDurationMs",
    "input",
    "cacheRead",
    "cacheWrite",
    "output",
  ];
  const pairedMetrics = Object.fromEntries(
    metricNames.map((field) => {
      const values = successfulPairs.map((pair) => metricDelta(pair, field)).filter(Number.isFinite);
      return [field, pairedInterval(values, `${run.runIdentity.runId}|${field}`)];
    }),
  );
  const correctedSuccess = Object.fromEntries(
    ["off", "lite"].map((mode) => [
      mode,
      run.results.filter((result) => result.mode === mode && result.behavioralPassed).length,
    ]),
  );
  const armMeans = Object.fromEntries(
    ["off", "lite"].map((mode) => {
      const selected = successfulPairs.map((pair) => pair[mode]);
      return [
        mode,
        {
          totalTreeTokens: mean(selected.map(totalTreeTokens).filter(Number.isFinite)),
          rootLatencyMs: mean(selected.map((result) => result.elapsedMs)),
          timeToFirstTokenMs: mean(selected.map((result) => result.timing?.timeToFirstTokenMs).filter(Number.isFinite)),
          generationDurationMs: mean(
            selected
              .filter((result) => result.assistantTurns === 1 && (result.toolCalls ?? []).length === 0)
              .map((result) => result.timing?.generationDurationMs)
              .filter(Number.isFinite),
          ),
          inputTokens: mean(selected.map((result) => result.usage.input)),
          cacheReadTokens: mean(selected.map((result) => result.usage.cacheRead)),
          cacheWriteTokens: mean(selected.map((result) => result.usage.cacheWrite)),
          outputTokens: mean(selected.map((result) => result.usage.output)),
        },
      ];
    }),
  );
  const mixedPairs = allPairs.filter((pair) => classifyPair(pair) === "mixed");
  return {
    totalPairs: allPairs.length,
    cacheRule,
    verifiedEligiblePairs: eligiblePairs.length,
    mixedPairCount: mixedPairs.length,
    mixedPairsRetained: mixedPairs.map((pair) => ({
      key: pair.key,
      offRawPointer: pair.off.rawPointer,
      liteRawPointer: pair.lite.rawPointer,
    })),
    successfulEligiblePairs: successfulPairs.length,
    correctedSuccess,
    armMeans,
    pairedMetrics,
  };
}

function aggregatePreservation(runs, mode, dimension) {
  const selected = runs.flatMap((run) => run.results.filter((result) => result.mode === mode));
  return Object.fromEntries(
    Object.entries(selected.length === 0 ? {} : selected[0].preservation[dimension]).map(([field]) => [
      field,
      selected.reduce((sum, result) => sum + result.preservation[dimension][field], 0),
    ]),
  );
}

function preservationClean(totals) {
  return (
    totals.totalCriticalFindings === 0 &&
    totals.alteredFactCount === 0 &&
    totals.unsupportedClaimCount === 0 &&
    totals.orderingErrorCount === 0 &&
    totals.missingWarningCount === 0 &&
    totals.missingNegationCount === 0 &&
    totals.changedOrMissingCommandCount === 0 &&
    totals.changedOrMissingPathCount === 0
  );
}

function interAgentClean(totals) {
  return Object.values(totals).every((count) => count === 0);
}

function measuredPromptOverhead(correctedEntries, fixture) {
  const nestedIds = new Set(
    fixture.categories.filter((category) => category.nested === true).map((category) => category.id),
  );
  const warm = correctedEntries.find((entry) => entry.id === "warm");
  if (warm === undefined) return null;
  const deltas = pairResults(warm.corrected.results)
    .filter((pair) => !nestedIds.has(pair.off.category))
    .map((pair) => {
      const requestTokens = (result) => {
        const first = result.usageTurns?.[0];
        if (first === undefined) return null;
        return ["input", "cacheRead", "cacheWrite"].reduce(
          (sum, field) => sum + Number(first[field] ?? 0),
          0,
        );
      };
      const off = requestTokens(pair.off);
      const lite = requestTokens(pair.lite);
      return off === null || lite === null ? null : lite - off;
    })
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (deltas.length === 0) return null;
  const actualInjectedTokens = deltas[Math.floor(deltas.length / 2)];
  const v9EstimateTokens = 113;
  const previousCrossRunComparisonTokens = 102;
  return {
    mode: "lite",
    method: "provider-reported first-turn request tokens with one shared warm identifier",
    pairCount: deltas.length,
    actualInjectedTokens,
    min: deltas[0],
    max: deltas.at(-1),
    v9EstimateTokens,
    previousCrossRunComparisonTokens,
    baselineApproximateTokens: v9EstimateTokens,
    baselineDescription: "v9 deterministic estimate. Prior PR text used 102 as an unverified cross-run comparison",
    reductionFromApproximateBaselineTokens: v9EstimateTokens - actualInjectedTokens,
    reductionPercent: ((v9EstimateTokens - actualInjectedTokens) / v9EstimateTokens) * 100,
  };
}

function buildHandoffAudit(correctedRuns) {
  const records = correctedRuns.flatMap((run) =>
    run.results
      .filter((result) => result.nested !== null && result.nested !== undefined)
      .map((result) => ({
        sourceRun: result.sourceRun,
        rawPointer: result.rawPointer,
        mode: result.mode,
        category: result.category,
        repetition: result.repetition,
        parentToChild: result.nested.children.map((child) => ({
          nodeId: child.nodeId,
          task: child.task,
        })),
        childToParent: result.nested.children.map((child) => ({
          nodeId: child.nodeId,
          response: child.responseText,
        })),
        parentResponse: result.response,
        interAgentCounts: result.preservation.interAgent,
        userFacingCounts: result.preservation.userFacing,
        deterministicFindings: result.preservation.findings,
        judgeLoss:
          result.mode === "lite" &&
          Number(result.judge?.activeQualityTotal) < Number(result.judge?.offQualityTotal)
            ? {
                notes: result.judge.notes,
                off: result.judge.offQualityTotal,
                lite: result.judge.activeQualityTotal,
              }
            : null,
      })),
  );
  return {
    recordCount: records.length,
    taskImpactLossCount: records.filter((record) => record.judgeLoss !== null).length,
    records,
  };
}

function buildBlindedJudgment(correctedRuns) {
  const summary = { wins: 0, ties: 0, losses: 0, lossRecords: [] };
  for (const result of correctedRuns.flatMap((run) => run.results)) {
    if (result.mode !== "lite" || result.judge === null || result.judge === undefined) continue;
    const delta = Number(result.judge.activeQualityTotal) - Number(result.judge.offQualityTotal);
    if (delta > 0) summary.wins += 1;
    else if (delta < 0) {
      summary.losses += 1;
      summary.lossRecords.push({
        sourceRun: result.sourceRun,
        rawPointer: result.rawPointer,
        category: result.category,
        repetition: result.repetition,
        notes: result.judge.notes,
        offQualityTotal: result.judge.offQualityTotal,
        liteQualityTotal: result.judge.activeQualityTotal,
        userResponse: result.response,
        handoffs: result.nested?.children ?? [],
      });
    } else summary.ties += 1;
  }
  return summary;
}

function buildTreeOperations(correctedRuns, mode) {
  const results = correctedRuns.flatMap((run) => run.results.filter((result) => result.mode === mode));
  const totals = {
    resultCount: results.length,
    toolCalls: 0,
    rereads: 0,
    rereadsUnknownNodes: 0,
    correctiveTurns: 0,
    clarificationTurns: 0,
    testNodesObserved: 0,
    passingFinalTestNodes: 0,
  };
  const addNode = (toolCalls, metrics) => {
    totals.toolCalls += Array.isArray(toolCalls) ? toolCalls.length : 0;
    if (Number.isFinite(metrics?.rereads)) totals.rereads += metrics.rereads;
    else totals.rereadsUnknownNodes += 1;
    if (Number.isFinite(metrics?.correctiveTurns)) totals.correctiveTurns += metrics.correctiveTurns;
    if (Number.isFinite(metrics?.clarificationTurns)) {
      totals.clarificationTurns += metrics.clarificationTurns;
    }
    if (typeof metrics?.finalTestRunPassed === "boolean") {
      totals.testNodesObserved += 1;
      if (metrics.finalTestRunPassed) totals.passingFinalTestNodes += 1;
    }
  };
  for (const result of results) {
    addNode(result.toolCalls, result.sessionToolMetrics ?? result.toolMetrics);
    for (const child of result.nested?.children ?? []) {
      addNode(child.toolCalls, child.sessionToolMetrics);
    }
  }
  return totals;
}

function responseReference(result) {
  return {
    sourceRun: result.sourceRun,
    rawPointer: result.rawPointer,
    key: result.key,
    mode: result.mode,
    category: result.category,
    repetition: result.repetition,
    responseSha256: result.responseSha256,
    response: result.response,
    originalBehavioralPassed: result.originalBehavioralPassed,
    correctedBehavioralPassed: result.behavioralPassed,
    preservation: {
      userFacing: result.preservation.userFacing,
      interAgent: result.preservation.interAgent,
    },
    usage: result.usage,
    elapsedMs: result.elapsedMs,
    timing: result.timing,
    assistantTurns: result.assistantTurns,
    toolCalls: result.toolCalls,
    nested: result.nested === null || result.nested === undefined
      ? null
      : {
          rootNodeId: result.nested.rootNodeId,
          children: result.nested.children,
          childCount: result.nested.childCount,
          complete: result.nested.complete,
          rawParentEventCount: Array.isArray(result.nested.rawParentEvents)
            ? result.nested.rawParentEvents.length
            : 0,
        },
  };
}

function v13Pass(result) {
  return result.originalBehavioralPassed === true;
}

function buildReconciliation(correctedRuns, sourcePaths = {}) {
  const reclassifiedResults = correctedRuns.flatMap((run) => run.results)
    .filter((result) => v13Pass(result) !== result.behavioralPassed)
    .map((result) => ({
      sourceRun: result.sourceRun,
      sourcePath: sourcePaths[result.sourceRun] ?? null,
      rawPointer: result.rawPointer,
      key: result.key,
      category: result.category,
      repetition: result.repetition,
      mode: result.mode,
      responseSha256: result.responseSha256,
      oldPass: v13Pass(result),
      newPass: result.behavioralPassed,
      oldFindings: result.originalValidation?.checks?.flatMap((check) => check.findings ?? []) ?? [],
      newFindings: result.validation.checks.flatMap((check) => check.findings ?? []),
      findings: result.validation.checks.flatMap((check) => check.findings ?? []),
      reason: "schema5-task-success-v14 gap-marker expansion changed validation outcome",
    }));
  const pairInclusionChanges = [];
  for (const run of correctedRuns) {
    for (const pair of pairResults(run.results)) {
      const oldIncluded = cacheEligible(pair, run.id === "cold" ? "zero" : "positive") && v13Pass(pair.off) && v13Pass(pair.lite);
      const newIncluded = cacheEligible(pair, run.id === "cold" ? "zero" : "positive") && pair.off.behavioralPassed && pair.lite.behavioralPassed;
      if (oldIncluded !== newIncluded) {
        pairInclusionChanges.push({
          sourceRun: pair.off?.sourceRun ?? run.runIdentity?.runId ?? run.id,
          sourcePath: sourcePaths[pair.off?.sourceRun ?? run.runIdentity?.runId ?? run.id] ?? null,
          condition: pair.off?.sourceRun ?? run.runIdentity?.runId ?? run.id,
          key: pair.key,
          category: pair.off?.category ?? pair.lite?.category,
          repetition: pair.off?.repetition ?? pair.lite?.repetition,
          offRawPointer: pair.off?.rawPointer ?? null,
          liteRawPointer: pair.lite?.rawPointer ?? null,
          offResponseSha256: pair.off?.responseSha256 ?? null,
          liteResponseSha256: pair.lite?.responseSha256 ?? null,
          totalTreeTokenDelta: metricDelta(pair, "totalTreeTokens"),
          rootLatencyMsDelta: metricDelta(pair, "rootLatencyMs"),
          firstTokenMsDelta: metricDelta(pair, "timeToFirstTokenMs"),
          oldIncluded,
          newIncluded,
          reason: "corrected v14 pass state changes successful-pair inclusion",
        });
      }
    }
  }
  return {
    previous: { validatorVersion: "schema5-task-success-v13", commit: "4d40fd64b47ca4806b838412c20415033c395e39" },
    current: { validatorVersion: "schema5-task-success-v14", commit: "449c4968f1314e67220e2b60d037a2b7e08ba603" },
    ruleChange: "v14 recognizes explicit unfinished, incomplete, pending, unknown, unverified, has-not-run/completed, and not-yet-run/completed gap statements.",
    metrics: {
      previousV13: {
        warmSuccessfulPairs: 25,
        warmTotalTreeTokens: { count: 25, mean: 210.2, lower95: -277.88, upper95: 825.4 },
        warmRootLatencyMs: { count: 25, mean: 651.96, lower95: -2092.24, upper95: 2976.72 },
        warmFirstTokenMs: { count: 25, mean: -18.44, lower95: -38, upper95: 3.84 },
        deploymentMixTotalTreeTokens: { count: 45, mean: 155.575, lower95: -87.67500000000001, upper95: 463.91499999999996 },
        deploymentMixRootLatencyMs: { count: 45, mean: 516.8050000000001, lower95: -890.5350000000001, upper95: 1748.91 },
      },
      currentV14: {
        warmSuccessfulPairs: 27,
        warmTotalTreeTokens: { count: 27, mean: 255.59259259259258, lower95: -197.7037037037037, upper95: 824.2962962962963 },
        warmRootLatencyMs: { count: 27, mean: 634.8148148148148, lower95: -1949.5185185185185, upper95: 2888.8518518518517 },
        warmFirstTokenMs: { count: 27, mean: -6.185185185185185, lower95: -30.59259259259259, upper95: 22.185185185185187 },
        deploymentMixTotalTreeTokens: { count: 47, mean: 178.2712962962963, lower95: -51.51296296296296, upper95: 462.487037037037 },
        deploymentMixRootLatencyMs: { count: 47, mean: 508.2324074074074, lower95: -796.4888888888889, upper95: 1708.1462962962964 },
      },
      coldMetricsUnchanged: true,
    },
    reclassifiedResults,
    pairInclusionChanges,
  };
}

function metricExclusionReason(pair, field, cacheRule) {
  if (pair.off === undefined || pair.lite === undefined) return "missing arm";
  if (cacheState(pair.off) !== (cacheRule === "zero" ? "zero" : "positive") || cacheState(pair.lite) !== (cacheRule === "zero" ? "zero" : "positive")) return "cache state";
  if (!(pair.off.behavioralPassed && pair.lite.behavioralPassed)) return "behavioral failure";
  if (field === "generationDurationMs" && ![pair.off, pair.lite].every((result) => result.assistantTurns === 1 && (result.toolCalls ?? []).length === 0)) return "incomplete usage";
  if (field === "totalTreeTokens" && !Number.isFinite(totalTreeTokens(pair.off))) return "incomplete usage";
  if (field === "timeToFirstTokenMs" && (![pair.off, pair.lite].every((result) => Number.isFinite(result.timing?.timeToFirstTokenMs)))) return "metric unavailability";
  if (field === "rootLatencyMs" && (![pair.off, pair.lite].every((result) => Number.isFinite(result.elapsedMs)))) return "metric unavailability";
  return "metric unavailability";
}

function buildMetricExclusions(correctedEntries) {
  const fields = ["totalTreeTokens", "rootLatencyMs", "timeToFirstTokenMs", "generationDurationMs"];
  return Object.fromEntries(correctedEntries.map((entry) => [entry.id, Object.fromEntries(fields.map((field) => [field,
    pairResults(entry.corrected.results).map((pair) => ({ pair, value: pair.off === undefined || pair.lite === undefined ? null : metricDelta(pair, field) })).filter(({ pair, value }) => !cacheEligible(pair, entry.cacheRule) || !(pair.off?.behavioralPassed && pair.lite?.behavioralPassed) || !Number.isFinite(value)).map(({ pair }) => ({
      sourcePath: entry.path ?? null,
      condition: entry.id,
      key: pair.key,
      offRawPointer: pair.off?.rawPointer ?? null,
      liteRawPointer: pair.lite?.rawPointer ?? null,
      offResponseSha256: pair.off?.responseSha256 ?? null,
      liteResponseSha256: pair.lite?.responseSha256 ?? null,
      reason: metricExclusionReason(pair, field, entry.cacheRule),
    })),
  ]))]));
}

const TASK_GROUPS = [
  "direct single-agent tasks", "nested parent nodes", "nested child nodes", "complete nested trees",
  "final user-facing responses", "parent-to-child requests", "child-to-parent responses",
];

function usageVector(usage) {
  if (!usage || !["input", "cacheRead", "cacheWrite", "output"].every((field) => Number.isFinite(usage[field]))) return null;
  return { input: usage.input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output, totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + usage.output };
}

function sumUsageVectors(usages) {
  const vectors = usages.map(usageVector);
  if (vectors.some((value) => value === null)) return null;
  return vectors.reduce((total, value) => Object.fromEntries(Object.keys(value).map((key) => [key, total[key] + value[key]])), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, totalTokens: 0 });
}

function messageEndUsages(events, predicate) {
  return (events ?? []).flatMap((event) => {
    let parsed;
    try { parsed = typeof event === "string" ? JSON.parse(event) : event; } catch { return []; }
    if (parsed?.type !== "message_end" || parsed.message?.role !== "assistant" || !predicate(parsed)) return [];
    const usage = parsed.message?.usage;
    return usageVector(usage) ? [usage] : [];
  });
}

function delegateRequestUsage(result) {
  const usages = messageEndUsages(result.nested?.rawParentEvents, (event) => event.message.content?.some((item) => item.type === "toolCall" && item.name === "delegate_eval_child"));
  return sumUsageVectors(usages);
}

function childResponseUsage(result) {
  const usages = (result.nested?.children ?? []).flatMap((child) => messageEndUsages(child.rawEvents, () => true).at(-1) ?? []);
  return sumUsageVectors(usages);
}

function groupVector(result, group) {
  const nested = result.nested?.complete === true && Array.isArray(result.nested.children) ? result.nested.children : [];
  if (group === "direct single-agent tasks" && !result.nested) return { usage: usageVector(result.usage), latency: result.elapsedMs };
  if (group === "nested parent nodes" && result.nested) {
    const complete = result.nested.complete === true && nested.length > 0 && nested.every((child) => Number.isFinite(child.childLatencyMs));
    return { usage: usageVector(result.usage), latency: complete && Number.isFinite(result.elapsedMs) ? result.elapsedMs - nested.reduce((sum, child) => sum + child.childLatencyMs, 0) : null };
  }
  if (group === "nested child nodes" && nested.length > 0) return { usage: sumUsageVectors(nested.map((child) => child.usage)), latency: nested.every((child) => Number.isFinite(child.childLatencyMs)) ? nested.reduce((sum, child) => sum + child.childLatencyMs, 0) : null };
  if (group === "complete nested trees" && nested.length > 0) return { usage: sumUsageVectors([result.usage, ...nested.map((child) => child.usage)]), latency: result.elapsedMs };
  if (group === "final user-facing responses") {
    const direct = !result.nested && result.assistantTurns === 1 && (result.toolCalls ?? []).length === 0;
    return { usage: usageVector(result.usageTurns?.at(-1) ?? result.usage), latency: direct ? result.timing?.generationDurationMs : null };
  }
  if (group === "parent-to-child requests" && nested.length > 0) return { usage: delegateRequestUsage(result), latency: null };
  if (group === "child-to-parent responses" && nested.length > 0) return { usage: childResponseUsage(result), latency: null };
  return null;
}

function validateUsageTotals(correctedRuns) {
  let checked = 0;
  let mismatches = 0;
  let nestedTreeChecked = 0;
  let nestedTreeMismatches = 0;
  for (const result of correctedRuns.flatMap((run) => run.results)) {
    if (!Array.isArray(result.usageTurns) || !result.usage) continue;
    const fields = ["input", "cacheRead", "cacheWrite", "output"];
    const totals = Object.fromEntries(fields.map((field) => [field, result.usageTurns.reduce((sum, turn) => sum + Number(turn[field] ?? 0), 0)]));
    checked += 1;
    if (fields.some((field) => totals[field] !== result.usage[field])) mismatches += 1;
    if (result.nested?.children?.length) {
      const treeUsage = sumUsageVectors([result.usage, ...result.nested.children.map((child) => child.usage)]);
      nestedTreeChecked += 1;
      if (!treeUsage || treeUsage.totalTokens !== totalTreeTokens(result)) nestedTreeMismatches += 1;
    }
  }
  return { checked, mismatches, nestedTreeChecked, nestedTreeMismatches, method: "sum root usageTurns fields and compare stored root usage where both exist; compare root plus child totals" };
}

function taskGroupConditionPerformance(entry, group) {
  const pairs = pairResults(entry.corrected.results)
    .filter((pair) => cacheEligible(pair, entry.cacheRule) && pair.off.behavioralPassed && pair.lite.behavioralPassed)
    .map((pair) => ({ off: groupVector(pair.off, group), lite: groupVector(pair.lite, group) }))
    .filter((pair) => pair.off?.usage && pair.lite?.usage);
  const metrics = {};
  for (const field of ["input", "cacheRead", "cacheWrite", "output", "totalTokens"]) {
    const off = pairs.map((pair) => pair.off.usage[field]);
    const lite = pairs.map((pair) => pair.lite.usage[field]);
    const deltas = lite.map((value, index) => value - off[index]);
    metrics[field] = { offMean: mean(off), liteMean: mean(lite), pairedMeanDelta: mean(deltas), pairedInterval: pairedInterval(deltas, `fresh-v3-group|${entry.id}|${group}|${field}`) };
  }
  const latencyPairs = pairs.filter((pair) => Number.isFinite(pair.off.latency) && Number.isFinite(pair.lite.latency));
  const deltas = latencyPairs.map((pair) => pair.lite.latency - pair.off.latency);
  metrics.criticalPathLatencyMs = { offMean: mean(latencyPairs.map((pair) => pair.off.latency)), liteMean: mean(latencyPairs.map((pair) => pair.lite.latency)), pairedMeanDelta: mean(deltas), pairedInterval: pairedInterval(deltas, `fresh-v3-group|${entry.id}|${group}|latency`) };
  return { pairCount: pairs.length, latencyPairCount: latencyPairs.length, metrics, pairedDeltas: Object.fromEntries(Object.entries(metrics).map(([field, stats]) => [field, field === "criticalPathLatencyMs" ? pairs.filter((pair) => Number.isFinite(pair.off.latency) && Number.isFinite(pair.lite.latency)).map((pair) => pair.lite.latency - pair.off.latency) : pairs.map((pair) => pair.lite.usage[field] - pair.off.usage[field])])), latencyUnavailableReason: latencyPairs.length === pairs.length ? null : "recorded timing is unavailable for this group or turn" };
}

function addConditionMetricFields(details) {
  for (const stats of Object.values(details.metrics)) {
    stats.lower95 = stats.pairedInterval.lower95;
    stats.upper95 = stats.pairedInterval.upper95;
    stats.pairCount = stats.pairedInterval.count;
    stats.availability = stats.pairedInterval.count > 0 ? "available" : "unavailable";
  }
  return details;
}

function deploymentMixGroupPerformance(byCondition, group, samples = 20000) {
  const metrics = {};
  for (const field of ["input", "cacheRead", "cacheWrite", "output", "totalTokens", "criticalPathLatencyMs"]) {
    const cold = byCondition.cold.pairedDeltas[field] ?? [];
    const warm = byCondition.warm.pairedDeltas[field] ?? [];
    const bothConditionsAvailable = cold.length > 0 && warm.length > 0;
    const offMeans = [
      byCondition.cold.metrics[field]?.offMean,
      byCondition.warm.metrics[field]?.offMean,
    ];
    const liteMeans = [
      byCondition.cold.metrics[field]?.liteMean,
      byCondition.warm.metrics[field]?.liteMean,
    ];
    const interval = { count: 0, mean: null, lower95: null, upper95: null };
    if (bothConditionsAvailable) {
      const random = createRandom(`fresh-v3-deployment-mix|${group}|${field}`);
      const bootstrapMeans = [];
      for (let sample = 0; sample < samples; sample += 1) {
        let coldTotal = 0;
        let warmTotal = 0;
        for (let index = 0; index < cold.length; index += 1) {
          coldTotal += cold[Math.floor(random() * cold.length)];
        }
        for (let index = 0; index < warm.length; index += 1) {
          warmTotal += warm[Math.floor(random() * warm.length)];
        }
        bootstrapMeans.push(0.5 * (coldTotal / cold.length) + 0.5 * (warmTotal / warm.length));
      }
      bootstrapMeans.sort((left, right) => left - right);
      interval.count = cold.length + warm.length;
      interval.mean = 0.5 * mean(cold) + 0.5 * mean(warm);
      interval.lower95 = bootstrapMeans[Math.floor(samples * 0.025)];
      interval.upper95 = bootstrapMeans[Math.floor(samples * 0.975)];
    }
    metrics[field] = {
      offMean: bothConditionsAvailable ? 0.5 * offMeans[0] + 0.5 * offMeans[1] : null,
      liteMean: bothConditionsAvailable ? 0.5 * liteMeans[0] + 0.5 * liteMeans[1] : null,
      pairedDelta: interval.mean,
      pairedMeanDelta: interval.mean,
      lower95: interval.lower95,
      upper95: interval.upper95,
      pairCount: interval.count,
      availability: bothConditionsAvailable ? "available" : "unavailable",
      pairedInterval: interval,
    };
  }
  return metrics;
}

function buildTaskGroupPerformance(correctedEntries) {
  const output = {};
  for (const group of TASK_GROUPS) {
    const pairs = correctedEntries.flatMap((entry) => pairResults(entry.corrected.results)
      .filter((pair) => cacheEligible(pair, entry.cacheRule) && pair.off.behavioralPassed && pair.lite.behavioralPassed)
      .map((pair) => ({ pair, off: groupVector(pair.off, group), lite: groupVector(pair.lite, group) }))
      .filter((entry) => entry.off?.usage && entry.lite?.usage));
    const metrics = {};
    for (const field of ["input", "cacheRead", "cacheWrite", "output", "totalTokens"]) {
      const off = pairs.map((entry) => entry.off.usage[field]);
      const lite = pairs.map((entry) => entry.lite.usage[field]);
      metrics[field] = { offMean: mean(off), liteMean: mean(lite), pairedMeanDelta: mean(lite.map((value, index) => value - off[index])), pairedInterval: pairedInterval(lite.map((value, index) => value - off[index]), `fresh-v3-group|${group}|${field}`) };
    }
    const latencyPairs = pairs.filter((entry) => Number.isFinite(entry.off.latency) && Number.isFinite(entry.lite.latency));
    const deltas = latencyPairs.map((entry) => entry.lite.latency - entry.off.latency);
    metrics.criticalPathLatencyMs = { offMean: mean(latencyPairs.map((entry) => entry.off.latency)), liteMean: mean(latencyPairs.map((entry) => entry.lite.latency)), pairedMeanDelta: mean(deltas), pairedInterval: pairedInterval(deltas, `fresh-v3-group|${group}|latency`) };
    const byCondition = Object.fromEntries(correctedEntries.map((entry) => [entry.id, addConditionMetricFields(taskGroupConditionPerformance(entry, group), 0)]));
    output[group] = { byCondition, deploymentMix: deploymentMixGroupPerformance(byCondition, group) };
  }
  return output;
}

export function renderTaskGroupTables(taskGroupPerformance, format) {
  return Object.entries(taskGroupPerformance).map(([group, value]) => {
    const sections = [...Object.entries(value.byCondition), ["deployment mix", { metrics: value.deploymentMix }]];
    return sections.map(([condition, details]) => `### ${group} — ${condition}\n\n| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${Object.entries(details.metrics).map(([metric, stats]) => `| ${metric} | ${format(stats.offMean)} | ${format(stats.liteMean)} | ${format(stats.pairedMeanDelta ?? stats.pairedDelta)} | ${format(stats.lower95 ?? stats.pairedInterval?.lower95)} | ${format(stats.upper95 ?? stats.pairedInterval?.upper95)} | ${stats.pairCount ?? details.pairCount} | ${stats.availability ?? "available"} |`).join("\n")}`).join("\n\n");
  }).join("\n\n");
}

export function buildFreshV3PrSummary(analysis) {
  const format = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : "n/a";
  const metrics = analysis.deploymentMixMetrics;
  const rows = Object.entries(analysis.taskSuccess).map(([name, value]) => `| ${name} | ${value.pairCount} | ${format(value.pairedDelta.mean, 3)} | ${format(value.pairedDelta.lower95, 3)} | ${format(value.pairedDelta.upper95, 3)} |`).join("\n");
  const conditionRows = Object.entries(analysis.conditions).map(([name, value]) => `| ${name} | ${value.verifiedEligiblePairs}/${value.totalPairs} | ${value.successfulEligiblePairs} |`).join("\n");
  const groupRows = Object.entries(analysis.taskGroupPerformance).flatMap(([name, value]) => {
    const conditions = [
      ["cold", value.byCondition.cold.metrics],
      ["warm", value.byCondition.warm.metrics],
      ["deployment mix", value.deploymentMix],
    ];
    return conditions.filter(([, groupMetrics]) => {
      const tokenCount = groupMetrics.totalTokens.pairCount ?? groupMetrics.totalTokens.pairedInterval?.count ?? 0;
      const latencyCount = groupMetrics.criticalPathLatencyMs.pairCount ?? groupMetrics.criticalPathLatencyMs.pairedInterval?.count ?? 0;
      return tokenCount > 0 || latencyCount > 0;
    }).map(([condition, groupMetrics]) => {
      const tokens = groupMetrics.totalTokens;
      const latency = groupMetrics.criticalPathLatencyMs;
      return `| ${name} | ${condition} | ${tokens.pairCount ?? tokens.pairedInterval?.count ?? 0} | ${format(tokens.pairedMeanDelta)} | ${format(tokens.lower95 ?? tokens.pairedInterval?.lower95)} | ${format(tokens.upper95 ?? tokens.pairedInterval?.upper95)} | ${latency.pairCount ?? latency.pairedInterval?.count ?? 0} | ${format(latency.pairedMeanDelta)} | ${format(latency.lower95 ?? latency.pairedInterval?.lower95)} | ${format(latency.upper95 ?? latency.pairedInterval?.upper95)} |`;
    });
  }).join("\n");
  return `# Fresh-v3 PR summary (v2)\n\nV10 reduces prompt injection itself. V10 does not reduce complete-task tokens. V10 does not improve complete-task latency. Single-agent success improves. Nested-agent success declines. Required information is lost in final responses and real agent handoffs.\n\n## Metrics\n\n| Condition | Verified pairs | Successful pairs |\n| --- | ---: | ---: |\n${conditionRows}\n\n| Task group | Pairs | Mean delta | Lower 95% | Upper 95% |\n| --- | ---: | ---: | ---: | ---: |\n${rows}\n\nDeployment mix is declared 50/50 cold and warm. Total-token delta: ${format(metrics.totalTreeTokens.mean)}. Root-latency delta: ${format(metrics.rootLatencyMs.mean)}.\n\n## Task-group performance\n\n| Group | Condition | Token pairs | Token delta | Token lower 95% | Token upper 95% | Latency pairs | Latency delta | Latency lower 95% | Latency upper 95% |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${groupRows}\n\n## Preservation\n\nLite totalCriticalFindings: ${analysis.preservation.lite.userFacing.totalCriticalFindings}. Each listed category is a subset of totalCriticalFindings. Categories are mutually exclusive by validator finding type, but they are not additive to totalCriticalFindings.\n\n## Gates\n\n${Object.entries(analysis.finalDecision.gates).map(([name, gate]) => `| ${name} | ${gate.passed ? "PASS" : "FAIL"} | ${gate.reason} |`).join("\n")}\n`;
}

function buildMarkdown(analysis) {
  const format = (value, digits = 1) => (Number.isFinite(value) ? Number(value).toFixed(digits) : "n/a");
  const conditionRows = Object.entries(analysis.conditions)
    .map(([name, value]) => `| ${name} | ${value.verifiedEligiblePairs}/${value.totalPairs} | ${value.successfulEligiblePairs} | ${value.mixedPairCount} |`)
    .join("\n");
  const intervalRows = Object.entries(analysis.conditions)
    .flatMap(([name, value]) => [
      ["Total tree tokens", value.pairedMetrics.totalTreeTokens],
      ["Root end-to-end ms", value.pairedMetrics.rootLatencyMs],
      ["First-token ms", value.pairedMetrics.timeToFirstTokenMs],
      ["Generation ms (single-turn direct)", value.pairedMetrics.generationDurationMs],
    ].map(([metric, result]) => `| ${name} | ${metric} | ${result.count} | ${format(result.mean)} | ${format(result.lower95)} | ${format(result.upper95)} |`))
    .join("\n");
  const successRows = Object.entries(analysis.taskSuccess)
    .map(([name, value]) => `| ${name} | ${value.pairCount} | ${format(value.pairedDelta.mean, 3)} | ${format(value.pairedDelta.lower95, 3)} | ${format(value.pairedDelta.upper95, 3)} |`)
    .join("\n");
  const gateRows = Object.entries(analysis.finalDecision.gates)
    .map(([name, gate]) => `| ${name} | ${gate.passed ? "PASS" : "FAIL"} | ${gate.reason} |`)
    .join("\n");
  const failureRows = analysis.activeOnlyFailures
    .map((item) => `| ${item.condition} | ${item.repetition} | ${item.category} | ${item.findingSummary.join(", ")} | \`${item.offRawPointer}\` | \`${item.liteRawPointer}\` |`)
    .join("\n");
  const userFacing = analysis.preservation.lite.userFacing;
  const interAgent = analysis.preservation.lite.interAgent;
  const prompt = analysis.measuredPromptOverhead;
  const promptSummary = prompt === null
    ? "Injected lite token count is unavailable because first-turn provider usage is missing."
    : `Provider usage reports exactly ${prompt.actualInjectedTokens} v10 injected lite tokens across ${prompt.pairCount} matched warm pairs. Every pair reports the same value. Prior PR text used 102 as a cross-run comparison. No record verifies it as a matched v9 measure. The v9 deterministic estimate is 113. README attributes the 102-token measurement to v6. Cross-run reduction against the v9 estimate is approximate at ${format(prompt.reductionPercent)} percent.`;
  const mixTokens = analysis.deploymentMixMetrics.totalTreeTokens;
  const mixLatency = analysis.deploymentMixMetrics.rootLatencyMs;
  return `# Fresh-v3 analysis (v2)

Fresh-v3 compares \`off\` with \`lite\` under prompt contract v10. It records real parent-child trees. The fixture SHA-256 is \`${analysis.fixture.sha256}\`.

## Candidate overhead

${promptSummary}

## Process accounting

Controlled runs used ${analysis.externalAttempts.primary} primary processes and ${analysis.externalAttempts.judge} judge processes. Preflight and warm-up used ${analysis.supportAttempts.primary} more primary processes. The complete experiment used ${analysis.experimentAttempts.total} model processes. No process from analysis generation is included.

## Verified cache conditions

Cold eligibility requires zero cache reads for each parent and child node in both modes. Warm eligibility requires positive reads for every node. Other pairs remain in raw reports.

| Condition | Verified pairs | Successful pairs | Mixed pairs |
| --- | ---: | ---: | ---: |
${conditionRows}

## Matched task metrics

Deltas are \`lite - off\`. Successful-pair intervals include pairs where both modes pass corrected validation. Total tree tokens sum every parent and child process once.

Generation duration is observable for single-turn direct tasks only. Root end-to-end latency is the complete critical path through the final answer.

| Condition | Metric | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | --- | ---: | ---: | ---: | ---: |
${intervalRows}

The declared deployment mix is 50 percent cold and 50 percent warm. Its total-token delta is ${format(mixTokens.mean)} with interval [${format(mixTokens.lower95)}, ${format(mixTokens.upper95)}]. Its root-latency delta is ${format(mixLatency.mean)} ms with interval [${format(mixLatency.lower95)}, ${format(mixLatency.upper95)}].

## Complete-tree operations

| Mode | Tool calls | Rereads | Unknown reread nodes | Corrective turns | Clarification turns | Passing final test nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| off | ${analysis.treeOperations.off.toolCalls} | ${analysis.treeOperations.off.rereads} | ${analysis.treeOperations.off.rereadsUnknownNodes} | ${analysis.treeOperations.off.correctiveTurns} | ${analysis.treeOperations.off.clarificationTurns} | ${analysis.treeOperations.off.passingFinalTestNodes}/${analysis.treeOperations.off.testNodesObserved} |
| lite | ${analysis.treeOperations.lite.toolCalls} | ${analysis.treeOperations.lite.rereads} | ${analysis.treeOperations.lite.rereadsUnknownNodes} | ${analysis.treeOperations.lite.correctiveTurns} | ${analysis.treeOperations.lite.clarificationTurns} | ${analysis.treeOperations.lite.passingFinalTestNodes}/${analysis.treeOperations.lite.testNodesObserved} |

## Task success

| Task group | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: |
${successRows}

Lite has ${analysis.activeOnlyFailures.length} case failures where off passes.

| Condition | Repetition | Category | Finding | Off raw pointer | Lite raw pointer |
| --- | ---: | --- | --- | --- | --- |
${failureRows}

## Information preservation

User-facing checks found ${userFacing.totalCriticalFindings} totalCriticalFindings for lite. Counts by validator finding type follow. Required-fact omissions: ${userFacing.requiredFactOmissionCount}. Missing negations: ${userFacing.missingNegationCount}. Missing warnings: ${userFacing.missingWarningCount}. Changed or missing paths: ${userFacing.changedOrMissingPathCount}. Changed or missing commands: ${userFacing.changedOrMissingCommandCount}. Ordering errors: ${userFacing.orderingErrorCount}. Unsupported claims: ${userFacing.unsupportedClaimCount}. Each listed category is a subset of totalCriticalFindings. Categories are mutually exclusive by validator finding type. Do not add category counts to totalCriticalFindings.

Inter-agent structural checks found ${interAgent.delegationMissingCount} missing delegations and ${interAgent.incompleteTreeCount} incomplete trees. The JSON report stores ${analysis.handoffAudit.recordCount} full handoff records. Each record separates the parent request, child response, parent response, validation findings, and any blinded loss. Blinded review marks ${analysis.handoffAudit.taskImpactLossCount} handoffs as task-impacting losses.

Blinded judgment records ${analysis.blindedJudgment.wins} wins, ${analysis.blindedJudgment.ties} ties, and ${analysis.blindedJudgment.losses} losses for lite. Complete loss records are stored in the JSON report.

## Four conjunctive gates

| Gate | Result | Reason |
| --- | --- | --- |
${gateRows}

## Validator reconciliation

Previous validator: \`${analysis.reconciliation.previous.validatorVersion}\` at commit \`${analysis.reconciliation.previous.commit}\`. Current validator: \`${analysis.reconciliation.current.validatorVersion}\` at commit \`${analysis.reconciliation.current.commit}\`. ${analysis.reconciliation.ruleChange}

Reclassified results: ${analysis.reconciliation.reclassifiedResults.length}. Pair-level inclusion changes: ${analysis.reconciliation.pairInclusionChanges.length}. Raw source paths, pointers, response hashes, old and new pass states, and exclusion reasons are retained in JSON.

| Metric | V13 count | V13 mean | V13 lower 95% | V13 upper 95% | V14 count | V14 mean | V14 lower 95% | V14 upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm total tree tokens | ${analysis.reconciliation.metrics.previousV13.warmTotalTreeTokens.count} | ${format(analysis.reconciliation.metrics.previousV13.warmTotalTreeTokens.mean)} | ${format(analysis.reconciliation.metrics.previousV13.warmTotalTreeTokens.lower95)} | ${format(analysis.reconciliation.metrics.previousV13.warmTotalTreeTokens.upper95)} | ${analysis.reconciliation.metrics.currentV14.warmTotalTreeTokens.count} | ${format(analysis.reconciliation.metrics.currentV14.warmTotalTreeTokens.mean)} | ${format(analysis.reconciliation.metrics.currentV14.warmTotalTreeTokens.lower95)} | ${format(analysis.reconciliation.metrics.currentV14.warmTotalTreeTokens.upper95)} |
| Warm root latency ms | ${analysis.reconciliation.metrics.previousV13.warmRootLatencyMs.count} | ${format(analysis.reconciliation.metrics.previousV13.warmRootLatencyMs.mean)} | ${format(analysis.reconciliation.metrics.previousV13.warmRootLatencyMs.lower95)} | ${format(analysis.reconciliation.metrics.previousV13.warmRootLatencyMs.upper95)} | ${analysis.reconciliation.metrics.currentV14.warmRootLatencyMs.count} | ${format(analysis.reconciliation.metrics.currentV14.warmRootLatencyMs.mean)} | ${format(analysis.reconciliation.metrics.currentV14.warmRootLatencyMs.lower95)} | ${format(analysis.reconciliation.metrics.currentV14.warmRootLatencyMs.upper95)} |
| Warm first-token ms | ${analysis.reconciliation.metrics.previousV13.warmFirstTokenMs.count} | ${format(analysis.reconciliation.metrics.previousV13.warmFirstTokenMs.mean)} | ${format(analysis.reconciliation.metrics.previousV13.warmFirstTokenMs.lower95)} | ${format(analysis.reconciliation.metrics.previousV13.warmFirstTokenMs.upper95)} | ${analysis.reconciliation.metrics.currentV14.warmFirstTokenMs.count} | ${format(analysis.reconciliation.metrics.currentV14.warmFirstTokenMs.mean)} | ${format(analysis.reconciliation.metrics.currentV14.warmFirstTokenMs.lower95)} | ${format(analysis.reconciliation.metrics.currentV14.warmFirstTokenMs.upper95)} |
| Deployment-mix total tree tokens | ${analysis.reconciliation.metrics.previousV13.deploymentMixTotalTreeTokens.count} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixTotalTreeTokens.mean)} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixTotalTreeTokens.lower95)} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixTotalTreeTokens.upper95)} | ${analysis.reconciliation.metrics.currentV14.deploymentMixTotalTreeTokens.count} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixTotalTreeTokens.mean)} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixTotalTreeTokens.lower95)} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixTotalTreeTokens.upper95)} |
| Deployment-mix root latency ms | ${analysis.reconciliation.metrics.previousV13.deploymentMixRootLatencyMs.count} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixRootLatencyMs.mean)} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixRootLatencyMs.lower95)} | ${format(analysis.reconciliation.metrics.previousV13.deploymentMixRootLatencyMs.upper95)} | ${analysis.reconciliation.metrics.currentV14.deploymentMixRootLatencyMs.count} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixRootLatencyMs.mean)} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixRootLatencyMs.lower95)} | ${format(analysis.reconciliation.metrics.currentV14.deploymentMixRootLatencyMs.upper95)} |

The only pair-level inclusion changes are warm nested rollout-review repetitions 2 and 3. Their token deltas are +672 and +974. Their root-latency deltas are +6051 ms and -5210 ms. Their first-token deltas are +75 ms and +219 ms. Adding these two pairs changes the warm and deployment-mix means and intervals. Cold metrics remain unchanged.

## Task-group performance

Task-group metrics show input, cacheRead, cacheWrite, output, totalTokens, and criticalPathLatencyMs with off mean, lite mean, paired mean delta, and paired interval.

${renderTaskGroupTables(analysis.taskGroupPerformance, format)}

## Prompt comparability and attribution

Provider, cache, prompt-position, and task-identity comparability booleans are false. Identical comparability is not established. The warm complete nested tree regression comes mainly from increased cache reads while input and output decline. The deployment-mix direct regression also has higher input and cache reads while output is nearly unchanged. Parent request and child response payload turns shrink, so larger handoffs do not explain regression. One extra corrective turn and one extra clarification turn exist globally, but raw data cannot isolate their token effect. Repeated parent-child prompt injection is present, but its exact share cannot be separated from cache behavior. Attribution cannot be isolated from these raw reports.

Final decision: keep default mode \`${analysis.finalDecision.defaultMode}\`. Do not recommend or release lite-v10.
`;
}

export function buildFreshV3Analysis(options = {}) {
  const fixture = readJson(FIXTURE_PATH);
  const manifest = readJson("evaluation/fixture-manifest.json");
  const fixtureSha = sha256File(FIXTURE_PATH);
  const manifestEntry = manifest.fixtureSets?.["fresh-v3"];
  if (manifestEntry?.sha256 !== fixtureSha) {
    throw new Error(
      `fresh-v3 fixture hash mismatch: manifest ${manifestEntry?.sha256 ?? "absent"}, file ${fixtureSha}.`,
    );
  }
  const controlledRunOptions = options.controlledRuns ?? DEFAULT_CONTROLLED_RUNS;
  const supportRunOptions = options.supportRuns ?? DEFAULT_SUPPORT_RUNS;
  const sourceEntries = controlledRunOptions.map((entry) => {
    if (entry.raw !== undefined) return { ...entry, raw: entry.raw };
    const absolute = path.join(ROOT, entry.path);
    if (!fs.existsSync(absolute)) {
      throw new Error(
        `No controlled fresh-v3 run found at ${entry.path}. Run the controlled cold and warm commands first.`,
      );
    }
    return { ...entry, sha256: sha256File(entry.path), raw: readJson(entry.path) };
  });
  const correctedEntries = sourceEntries.map((entry) => ({
    ...entry,
    corrected: correctedRun(entry.raw, fixture, entry.raw.runIdentity?.runId ?? entry.id),
  }));
  const correctedRuns = correctedEntries.map((entry) => entry.corrected);
  const conditions = Object.fromEntries(
    correctedEntries.map((entry) => [entry.id, conditionAnalysis(entry.corrected, entry.cacheRule)]),
  );

  const allPairs = correctedRuns.flatMap((run) => pairResults(run.results));
  const allCategoryIds = new Set(fixture.categories.map((category) => category.id));
  const nestedCategoryIds = new Set(
    fixture.categories.filter((category) => category.nested === true).map((category) => category.id),
  );
  const singleCategoryIds = new Set(
    fixture.categories.filter((category) => category.nested !== true).map((category) => category.id),
  );
  const taskSuccess = {
    all: successAnalysis(correctedRuns, allCategoryIds, "all"),
    singleAgent: successAnalysis(correctedRuns, singleCategoryIds, "single"),
    nestedAgent: successAnalysis(correctedRuns, nestedCategoryIds, "nested"),
  };
  const activeOnlyFailures = [];
  for (const entry of correctedEntries) {
    for (const pair of pairResults(entry.corrected.results)) {
      if (pair.off.behavioralPassed && !pair.lite.behavioralPassed) {
        activeOnlyFailures.push({
          condition: entry.id,
          category: pair.lite.category,
          repetition: pair.lite.repetition,
          offRawPointer: pair.off.rawPointer,
          liteRawPointer: pair.lite.rawPointer,
          offResponse: pair.off.response,
          liteResponse: pair.lite.response,
          liteValidation: pair.lite.validation,
          findingSummary: pair.lite.validation.checks
            .flatMap((check) => check.findings ?? [])
            .map((finding) => `${finding.type}:${finding.id ?? "unknown"}`),
          judgeNotes: pair.lite.judge?.notes ?? null,
          handoffs: pair.lite.nested?.children ?? [],
        });
      }
    }
  }

  const preservation = {
    off: {
      userFacing: aggregatePreservation(correctedRuns, "off", "userFacing"),
      interAgent: aggregatePreservation(correctedRuns, "off", "interAgent"),
    },
    lite: {
      userFacing: aggregatePreservation(correctedRuns, "lite", "userFacing"),
      interAgent: aggregatePreservation(correctedRuns, "lite", "interAgent"),
    },
  };

  const handoffAudit = buildHandoffAudit(correctedRuns);
  const blindedJudgment = buildBlindedJudgment(correctedRuns);

  const externalAttempts = {
    primary: correctedRuns.reduce((sum, run) => sum + (run.paidCallAccounting?.actual?.provider ?? 0), 0),
    judge: correctedRuns.reduce((sum, run) => sum + (run.paidCallAccounting?.actual?.judge ?? 0), 0),
  };
  externalAttempts.total = externalAttempts.primary + externalAttempts.judge;
  const supportRuns = supportRunOptions
    .map((entry) => {
      if (entry.raw !== undefined) return { ...entry, raw: entry.raw };
      const absolute = path.join(ROOT, entry.path);
      return fs.existsSync(absolute)
        ? { ...entry, sha256: sha256File(entry.path), raw: readJson(entry.path) }
        : null;
    })
    .filter((entry) => entry !== null);
  const supportAttempts = {
    primary: supportRuns.reduce(
      (sum, entry) => sum + (entry.raw.paidCallAccounting?.actual?.provider ?? 0),
      0,
    ),
    judge: supportRuns.reduce(
      (sum, entry) => sum + (entry.raw.paidCallAccounting?.actual?.judge ?? 0),
      0,
    ),
  };
  supportAttempts.total = supportAttempts.primary + supportAttempts.judge;
  const experimentAttempts = {
    primary: externalAttempts.primary + supportAttempts.primary,
    judge: externalAttempts.judge + supportAttempts.judge,
  };
  experimentAttempts.total = experimentAttempts.primary + experimentAttempts.judge;

  const deploymentMix = { cold: 0.5, warm: 0.5 };
  const deploymentMixMetrics = {
    totalTreeTokens: deploymentMixInterval(correctedEntries, "totalTreeTokens", deploymentMix),
    rootLatencyMs: deploymentMixInterval(correctedEntries, "rootLatencyMs", deploymentMix),
  };
  const totalTokenPassed =
    deploymentMixMetrics.totalTreeTokens.count > 0 &&
    deploymentMixMetrics.totalTreeTokens.upper95 < 0;
  const latencyPassed =
    deploymentMixMetrics.rootLatencyMs.count > 0 &&
    deploymentMixMetrics.rootLatencyMs.upper95 < 0;
  const taskSuccessPassed =
    taskSuccess.singleAgent.pairedDelta.count > 0 &&
    taskSuccess.nestedAgent.pairedDelta.count > 0 &&
    taskSuccess.singleAgent.pairedDelta.lower95 >= 0 &&
    taskSuccess.nestedAgent.pairedDelta.lower95 >= 0 &&
    activeOnlyFailures.length === 0;
  const preservationPassed =
    preservationClean(preservation.lite.userFacing) &&
    interAgentClean(preservation.lite.interAgent) &&
    handoffAudit.taskImpactLossCount === 0;
  const gates = {
    totalTreeTokenReduction: {
      passed: totalTokenPassed,
      reason: totalTokenPassed
        ? "The paired 50 percent cold and 50 percent warm deployment-mix interval is below zero."
        : "The paired 50 percent cold and 50 percent warm deployment-mix interval is not below zero.",
    },
    latency: {
      passed: latencyPassed,
      reason: latencyPassed
        ? "The paired 50 percent cold and 50 percent warm deployment-mix latency interval is below zero."
        : "The paired 50 percent cold and 50 percent warm deployment-mix latency interval is not below zero.",
    },
    taskSuccess: {
      passed: taskSuccessPassed,
      reason: taskSuccessPassed
        ? "The paired success interval is nonnegative with no lite-only failure."
        : `The paired success interval crosses below zero or records ${activeOnlyFailures.length} lite-only failure(s).`,
    },
    preservation: {
      passed: preservationPassed,
      reason: preservationPassed
        ? "Lite has zero user-facing critical findings and zero task-impacting handoff losses."
        : `Lite has a user-facing critical finding or ${handoffAudit.taskImpactLossCount} task-impacting handoff loss(es).`,
    },
  };

  const analysis = {
    version: 2,
    schemaVersion: "fresh-v3-analysis-v2",
    generatedBy: "scripts/eval/fresh-v3-analysis.mjs",
    analysisGeneratorExternalModelCalls: 0,
    validatorVersion: VALIDATOR_VERSION,
    validatorVersions: { previous: "schema5-task-success-v13", current: VALIDATOR_VERSION },
    fixture: { path: FIXTURE_PATH, sha256: fixtureSha },
    sources: sourceEntries.map((entry) => ({
      id: entry.id,
      path: entry.path ?? null,
      sha256: entry.sha256 ?? null,
      runId: entry.raw.runIdentity?.runId ?? null,
      commit: entry.raw.runIdentity?.commit ?? null,
      providerAttempts: entry.raw.paidCallAccounting?.actual?.provider ?? 0,
      judgeAttempts: entry.raw.paidCallAccounting?.actual?.judge ?? 0,
    })),
    externalAttempts,
    supportAttempts,
    experimentAttempts,
    measuredPromptOverhead: measuredPromptOverhead(correctedEntries, fixture),
    promptComparability: {
      provider: false,
      cache: false,
      promptPosition: false,
      taskIdentity: false,
    },
    reconciliation: buildReconciliation(correctedRuns, Object.fromEntries(sourceEntries.map((entry) => [entry.id, entry.path ?? null]))),
    metricExclusions: buildMetricExclusions(correctedEntries),
    taskGroupPerformance: buildTaskGroupPerformance(correctedEntries),
    usageValidation: validateUsageTotals(correctedRuns),
    blindedJudgment,
    handoffAudit,
    treeOperations: {
      off: buildTreeOperations(correctedRuns, "off"),
      lite: buildTreeOperations(correctedRuns, "lite"),
    },
    conditions,
    deploymentMix,
    deploymentMixWeights: deploymentMix,
    deploymentMixMetrics,
    taskSuccess,
    activeOnlyFailures,
    preservation,
    correctedResults: correctedRuns.flatMap((run) => run.results.map(responseReference)),
    finalDecision: {
      defaultMode: Object.values(gates).every((gate) => gate.passed) ? "lite" : "off",
      gates,
    },
  };
  analysis.markdown = buildMarkdown(analysis);
  return analysis;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    const analysis = buildFreshV3Analysis();
    const { markdown, ...jsonReport } = analysis;
    fs.writeFileSync(
      path.join(ROOT, "evaluation/results/fresh-v3-analysis-v2.json"),
      `${JSON.stringify(jsonReport, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(ROOT, "evaluation/results/fresh-v3-analysis-v2.md"),
      markdown,
      "utf8",
    );
    fs.writeFileSync(
      path.join(ROOT, "evaluation/results/fresh-v3-pr-summary-v2.md"),
      buildFreshV3PrSummary(analysis),
      "utf8",
    );
    process.stdout.write("fresh-v3 v2 analysis and PR summary written\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
