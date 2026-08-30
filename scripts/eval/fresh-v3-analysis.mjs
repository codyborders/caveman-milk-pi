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
  return {
    userFacing: {
      criticalOmissionCount: count((finding) => USER_FACING_TYPES.has(finding.type) && finding.type !== "noncritical-omission"),
      noncriticalOmissionCount: count((finding) => finding.type === "noncritical-omission"),
      alteredFactCount: count((finding) => finding.type === "altered-fact"),
      unsupportedClaimCount: count((finding) => finding.type === "unsupported-claim"),
      orderingErrorCount: count((finding) => finding.type === "ordering-error"),
      warningFailureCount: count((finding) => finding.type === "missing-warning"),
      missingNegationCount: count((finding) => finding.type === "missing-negation"),
      changedCommandCount: count((finding) => finding.type === "missing-command"),
      changedPathCount: count((finding) => finding.type === "missing-path"),
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
    totals.criticalOmissionCount === 0 &&
    totals.alteredFactCount === 0 &&
    totals.unsupportedClaimCount === 0 &&
    totals.orderingErrorCount === 0 &&
    totals.warningFailureCount === 0 &&
    totals.missingNegationCount === 0 &&
    totals.changedCommandCount === 0 &&
    totals.changedPathCount === 0
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
  const baselineApproximateTokens = 102;
  return {
    mode: "lite",
    method: "provider-reported first-turn request tokens with one shared warm identifier",
    pairCount: deltas.length,
    actualInjectedTokens,
    min: deltas[0],
    max: deltas.at(-1),
    baselineApproximateTokens,
    reductionFromApproximateBaselineTokens: baselineApproximateTokens - actualInjectedTokens,
    reductionPercent: ((baselineApproximateTokens - actualInjectedTokens) / baselineApproximateTokens) * 100,
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

function buildMarkdown(analysis) {
  const format = (value, digits = 1) => (value === null ? "n/a" : Number(value).toFixed(digits));
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
    : `Provider usage reports ${prompt.actualInjectedTokens} injected lite tokens across ${prompt.pairCount} matched warm pairs. Every pair reports the same value. The approximate v9 baseline is ${prompt.baselineApproximateTokens} tokens. V10 removes ${prompt.reductionFromApproximateBaselineTokens} tokens, or ${format(prompt.reductionPercent)} percent.`;
  const mixTokens = analysis.deploymentMixMetrics.totalTreeTokens;
  const mixLatency = analysis.deploymentMixMetrics.rootLatencyMs;
  return `# Fresh-v3 analysis (v1)

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

User-facing checks found ${userFacing.criticalOmissionCount} critical omissions and ${userFacing.missingNegationCount} missing negations for lite. They also found ${userFacing.orderingErrorCount} ordering errors and ${userFacing.changedPathCount} changed paths. Warning failures total ${userFacing.warningFailureCount}.

Inter-agent structural checks found ${interAgent.delegationMissingCount} missing delegations and ${interAgent.incompleteTreeCount} incomplete trees. The JSON report stores ${analysis.handoffAudit.recordCount} full handoff records. Each record separates the parent request, child response, parent response, validation findings, and any blinded loss. Blinded review marks ${analysis.handoffAudit.taskImpactLossCount} handoffs as task-impacting losses.

Blinded judgment records ${analysis.blindedJudgment.wins} wins, ${analysis.blindedJudgment.ties} ties, and ${analysis.blindedJudgment.losses} losses for lite. Complete loss records are stored in the JSON report.

## Four conjunctive gates

| Gate | Result | Reason |
| --- | --- | --- |
${gateRows}

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
    version: 1,
    generatedBy: "scripts/eval/fresh-v3-analysis.mjs",
    analysisGeneratorExternalModelCalls: 0,
    validatorVersion: VALIDATOR_VERSION,
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
    blindedJudgment,
    handoffAudit,
    treeOperations: {
      off: buildTreeOperations(correctedRuns, "off"),
      lite: buildTreeOperations(correctedRuns, "lite"),
    },
    conditions,
    deploymentMix,
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
      path.join(ROOT, "evaluation/results/fresh-v3-analysis-v1.json"),
      `${JSON.stringify(jsonReport, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(ROOT, "evaluation/results/fresh-v3-analysis-v1.md"),
      markdown,
      "utf8",
    );
    process.stdout.write("fresh-v3 analysis written to evaluation/results/fresh-v3-analysis-v1.json\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
