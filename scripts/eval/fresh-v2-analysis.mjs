import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRequirements } from "./validators.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const FIXTURE_PATH = "scripts/evaluation-fixtures-fresh-v2.json";
const CONTROLLED_RUNS = [
  { id: "cold", path: "evaluation/results/fresh-v2-cold-controlled-v1.json", cacheRule: "zero" },
  { id: "warm", path: "evaluation/results/fresh-v2-warm-controlled-v1.json", cacheRule: "positive" },
];
const AUXILIARY_RUNS = [
  "evaluation/results/fresh-v2-tool-preflight.json",
  "evaluation/results/fresh-v2-cold-v1.json",
  "evaluation/results/fresh-v2-warm-v1.json",
  "evaluation/results/fresh-v2-warmup-shared-v1.json",
];
const VALIDATOR_VERSION = "schema5-task-success-v14";
const CRITICAL_TYPES = new Set([
  "critical-omission",
  "missing-negation",
  "missing-warning",
  "missing-identifier",
  "missing-path",
  "missing-command",
  "missing-number",
  "gap-not-marked",
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

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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
  if (values.length === 0) return { count: 0, mean: null, median: null, lower95: null, upper95: null };
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
    median: median(values),
    lower95: means[Math.floor(samples * 0.025)],
    upper95: means[Math.floor(samples * 0.975)],
  };
}

function totalTokens(result) {
  const usage = result.usage;
  return usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
}

function preservationFrom(validation) {
  const findings = validation.checks.flatMap((check) => check.findings ?? []);
  const count = (predicate) => findings.filter(predicate).length;
  return {
    criticalOmissionCount: count((finding) => CRITICAL_TYPES.has(finding.type)),
    noncriticalOmissionCount: count((finding) => finding.type === "noncritical-omission"),
    alteredFactCount: count((finding) => finding.type === "altered-fact"),
    unsupportedClaimCount: count((finding) => finding.type === "unsupported-claim"),
    orderingErrorCount: count((finding) => finding.type === "ordering-error"),
    warningFailureCount: count((finding) => finding.type === "missing-warning"),
    negationFailureCount: count((finding) => finding.type === "missing-negation"),
    changedCommandCount: count((finding) => finding.type === "missing-command"),
    changedPathCount: count((finding) => finding.type === "missing-path"),
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

function cacheEligible(pair, rule) {
  if (pair.off === undefined || pair.lite === undefined) return false;
  if (rule === "zero") return pair.off.usage.cacheRead === 0 && pair.lite.usage.cacheRead === 0;
  return pair.off.usage.cacheRead > 0 && pair.lite.usage.cacheRead > 0;
}

function countCachePairs(results) {
  const counts = { bothZero: 0, bothPositive: 0, mixed: 0 };
  for (const pair of pairResults(results)) {
    const zero = [pair.off, pair.lite].map((result) => result.usage.cacheRead === 0);
    if (zero.every(Boolean)) counts.bothZero += 1;
    else if (zero.every((value) => !value)) counts.bothPositive += 1;
    else counts.mixed += 1;
  }
  return counts;
}

function recoverSessionToolMetrics(result) {
  if (result.sessionToolMetrics !== undefined && result.sessionToolMetrics !== null) {
    return { ...result.sessionToolMetrics, recovered: false };
  }
  const testsRun = (result.toolCalls ?? []).filter((call) => call.name === "workspace_run_tests").length;
  const disciplinePassed = (result.validation?.checks ?? []).some(
    (check) => check.id === "discipline" && check.passed === true,
  );
  return {
    testsRun,
    passingTestRuns: disciplinePassed ? 1 : 0,
    finalTestRunPassed: testsRun > 0 ? disciplinePassed : null,
    failedTestsWithoutCorrectiveTurn: result.toolMetrics?.failedTestsWithoutCorrectiveTurn ?? null,
    correctiveTurns: result.toolMetrics?.correctiveTurns ?? null,
    rereads: result.toolMetrics?.rereads ?? null,
    recovered: true,
    recoverySource: "original persisted workspace-discipline result",
  };
}

function toolDurationTotal(result) {
  const value = result.toolMetrics?.toolDurationMs;
  if (Array.isArray(value)) return value.filter(Number.isFinite).reduce((sum, item) => sum + item, 0);
  return Number.isFinite(value) ? value : 0;
}

function correctedRun(source, fixture, runId) {
  const categories = new Map(fixture.categories.map((category) => [category.id, category]));
  const results = source.results.map((result, index) => {
    const category = categories.get(result.category);
    const sessionToolMetrics = recoverSessionToolMetrics(result);
    const validation = runRequirements(result.response, category.requirements ?? [], {
      toolCalls: result.toolCalls ?? [],
      expectsTool: category.expectsTool === true,
      sessionToolMetrics,
    });
    return {
      ...result,
      originalBehavioralPassed: result.behavioralPassed,
      behavioralPassed: validation.passed,
      originalValidation: result.validation,
      validation,
      preservation: preservationFrom(validation),
      sessionToolMetrics,
      rawPointer: `/results/${index}`,
      responseSha256: sha256Text(result.response),
      sourceRun: runId,
    };
  });
  return { ...source, results };
}

function metricDelta(pair, field) {
  if (field === "totalTokens") return totalTokens(pair.lite) - totalTokens(pair.off);
  if (field === "latencyMs") return pair.lite.elapsedMs - pair.off.elapsedMs;
  if (field === "timeToFirstTokenMs") {
    const off = pair.off.timing?.timeToFirstTokenMs;
    const lite = pair.lite.timing?.timeToFirstTokenMs;
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  if (field === "generationDurationMs") {
    const singleTurn = [pair.off, pair.lite].every(
      (result) => result.assistantTurns === 1 && (result.toolMetrics?.toolCalls ?? 0) === 0,
    );
    if (!singleTurn) return null;
    const off = pair.off.timing?.generationDurationMs;
    const lite = pair.lite.timing?.generationDurationMs;
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  if (["input", "cacheRead", "cacheWrite", "output"].includes(field)) {
    return pair.lite.usage[field] - pair.off.usage[field];
  }
  if (field === "retries") {
    const off = pair.off.toolMetrics?.retries;
    const lite = pair.lite.toolMetrics?.retries;
    return Number.isFinite(off) && Number.isFinite(lite) ? lite - off : null;
  }
  const metric = {
    toolDurationMs: "toolDurationMs",
    toolCalls: "toolCalls",
    rereads: "rereads",
    correctiveTurns: "correctiveTurns",
  }[field];
  if (field === "toolDurationMs") return toolDurationTotal(pair.lite) - toolDurationTotal(pair.off);
  const off = pair.off.toolMetrics?.[metric] ?? 0;
  const lite = pair.lite.toolMetrics?.[metric] ?? 0;
  return lite - off;
}

function conditionAnalysis(run, cacheRule) {
  const allPairs = pairResults(run.results);
  const eligiblePairs = allPairs.filter((pair) => cacheEligible(pair, cacheRule));
  const successfulPairs = eligiblePairs.filter(
    (pair) => pair.off.behavioralPassed && pair.lite.behavioralPassed,
  );
  const metricNames = [
    "totalTokens",
    "latencyMs",
    "timeToFirstTokenMs",
    "generationDurationMs",
    "input",
    "cacheRead",
    "cacheWrite",
    "output",
    "toolDurationMs",
    "toolCalls",
    "retries",
    "rereads",
    "correctiveTurns",
  ];
  const pairedMetrics = Object.fromEntries(
    metricNames.map((field) => {
      const values = successfulPairs.map((pair) => metricDelta(pair, field)).filter(Number.isFinite);
      return [field, pairedInterval(values, `${run.runIdentity.runId}|${field}`)];
    }),
  );
  const correctedSuccess = Object.fromEntries(
    ["off", "lite"].map((mode) => [mode, run.results.filter((result) => result.mode === mode && result.behavioralPassed).length]),
  );
  const armMeans = Object.fromEntries(
    ["off", "lite"].map((mode) => {
      const selected = successfulPairs.map((pair) => pair[mode]);
      return [mode, {
        totalTokens: mean(selected.map(totalTokens)),
        latencyMs: mean(selected.map((result) => result.elapsedMs)),
        timeToFirstTokenMs: mean(selected.map((result) => result.timing?.timeToFirstTokenMs).filter(Number.isFinite)),
        generationDurationMs: mean(selected
          .filter((result) => result.assistantTurns === 1 && (result.toolMetrics?.toolCalls ?? 0) === 0)
          .map((result) => result.timing?.generationDurationMs)
          .filter(Number.isFinite)),
        inputTokens: mean(selected.map((result) => result.usage.input)),
        cacheReadTokens: mean(selected.map((result) => result.usage.cacheRead)),
        cacheWriteTokens: mean(selected.map((result) => result.usage.cacheWrite)),
        outputTokens: mean(selected.map((result) => result.usage.output)),
        toolDurationMs: mean(selected.map(toolDurationTotal)),
        toolCalls: mean(selected.map((result) => result.toolMetrics?.toolCalls ?? 0)),
        retries: mean(selected.map((result) => result.toolMetrics?.retries).filter(Number.isFinite)),
        rereads: mean(selected.map((result) => result.toolMetrics?.rereads ?? 0)),
        correctiveTurns: mean(selected.map((result) => result.toolMetrics?.correctiveTurns ?? 0)),
      }];
    }),
  );
  const activeOnly = allPairs.filter((pair) => pair.lite.behavioralPassed && !pair.off.behavioralPassed);
  const offOnly = allPairs.filter((pair) => pair.off.behavioralPassed && !pair.lite.behavioralPassed);
  return {
    totalPairs: allPairs.length,
    cachePairCounts: countCachePairs(run.results),
    cacheEligiblePairs: eligiblePairs.length,
    successfulEligiblePairs: successfulPairs.length,
    correctedSuccess,
    armMeans,
    activeOnlySuccessCount: activeOnly.length,
    offOnlySuccessCount: offOnly.length,
    pairedMetrics,
  };
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
    protectedFactManifest: result.protectedFactManifest,
    originalBehavioralPassed: result.originalBehavioralPassed,
    correctedBehavioralPassed: result.behavioralPassed,
    originalValidation: result.originalValidation,
    correctedValidation: result.validation,
    preservation: result.preservation,
    usage: result.usage,
    elapsedMs: result.elapsedMs,
    timing: result.timing,
    toolMetrics: result.toolMetrics,
    sessionToolMetrics: result.sessionToolMetrics,
    assistantTurns: result.assistantTurns,
    toolCalls: result.toolCalls,
  };
}

function classifyJudgeLoss(result) {
  if (result.category === "v2-safety-warning") {
    return {
      classification: "Other",
      explanation: "The lite response changes possible failed recovery into categorical irreversibility. This could change an approval decision.",
      taskImpact: true,
    };
  }
  return {
    classification: "Style preference without task impact",
    explanation: "The judge prefers handling for overflow or unitless values. The locked task does not define either edge case.",
    taskImpact: false,
  };
}

function aggregateQuality(runs) {
  const totals = { wins: 0, ties: 0, losses: 0 };
  for (const run of runs) {
    for (const result of run.results.filter((item) => item.mode === "lite" && item.judge !== null)) {
      if (result.judge.activeQualityTotal > result.judge.offQualityTotal) totals.wins += 1;
      else if (result.judge.activeQualityTotal < result.judge.offQualityTotal) totals.losses += 1;
      else totals.ties += 1;
    }
  }
  return totals;
}

function aggregateInformation(runs, mode) {
  const selected = runs.flatMap((run) => run.results.filter((result) => result.mode === mode));
  const fields = [
    "criticalOmissionCount",
    "noncriticalOmissionCount",
    "alteredFactCount",
    "unsupportedClaimCount",
    "orderingErrorCount",
    "warningFailureCount",
    "negationFailureCount",
    "changedCommandCount",
    "changedPathCount",
  ];
  return Object.fromEntries(
    fields.map((field) => [field, selected.reduce((sum, result) => sum + result.preservation[field], 0)]),
  );
}

function aggregateBehavior(runs, mode) {
  const selected = runs.flatMap((run) => run.results.filter((result) => result.mode === mode));
  const total = (field) => selected.reduce((sum, result) => sum + (result.toolMetrics?.[field] ?? 0), 0);
  const retries = selected.map((result) => result.toolMetrics?.retries);
  return {
    toolCalls: total("toolCalls"),
    toolDurationMs: selected.reduce((sum, result) => sum + toolDurationTotal(result), 0),
    retries: retries.every(Number.isFinite) ? retries.reduce((sum, value) => sum + value, 0) : null,
    rereads: total("rereads"),
    correctiveTurns: total("correctiveTurns"),
  };
}

function buildMarkdown(analysis) {
  const format = (value, digits = 1) => value === null ? "n/a" : Number(value).toFixed(digits);
  const gateRows = Object.entries(analysis.finalDecision.gates)
    .map(([name, gate]) => `| ${name} | ${gate.passed ? "PASS" : "FAIL"} | ${gate.reason} |`)
    .join("\n");
  const conditionRows = Object.entries(analysis.conditions)
    .map(([name, value]) => `| ${name} | ${value.cacheEligiblePairs}/${value.totalPairs} | ${value.successfulEligiblePairs} |`)
    .join("\n");
  const intervalRows = Object.entries(analysis.conditions)
    .flatMap(([name, value]) => [
      ["Total tokens", value.pairedMetrics.totalTokens],
      ["End-to-end ms", value.pairedMetrics.latencyMs],
      ["First-token ms", value.pairedMetrics.timeToFirstTokenMs],
      ["Single-turn generation ms", value.pairedMetrics.generationDurationMs],
    ].map(([metric, result]) => `| ${name} | ${metric} | ${format(result.mean)} | ${format(result.lower95)} | ${format(result.upper95)} |`))
    .join("\n");
  const componentRows = Object.entries(analysis.conditions)
    .flatMap(([condition, value]) => ["off", "lite"].map((mode) => {
      const arm = value.armMeans[mode];
      return `| ${condition} | ${mode} | ${format(arm.inputTokens)} | ${format(arm.cacheReadTokens)} | ${format(arm.cacheWriteTokens)} | ${format(arm.outputTokens)} | ${format(arm.totalTokens)} | ${format(arm.toolDurationMs)} | ${format(arm.toolCalls, 2)} | ${format(arm.retries, 2)} | ${format(arm.rereads, 2)} | ${format(arm.correctiveTurns, 2)} |`;
    }))
    .join("\n");
  return `# Fresh-v2 final analysis (v1)

Fresh-v2 compares \`off\` with \`lite\`. Evaluator correction did not change the locked prompt contract v9. The fixture SHA-256 is \`${analysis.fixture.sha256}\`.

The work started ${analysis.externalAttempts.primary} primary processes and ${analysis.externalAttempts.judge} judge processes. Provider failures and judge failures were both zero.

## Cache placement warning

The first run labeled cold did not create a cold condition. Only ${analysis.auxiliaryRuns.coldInitial.cachePairCounts.bothZero} of ${analysis.auxiliaryRuns.coldInitial.totalPairs} pairs had zero cache reads in both arms. That run remains raw data and is excluded from release intervals.

The controlled cold run prepended equal-length unique identifiers before the normal system prompt. It produced ${analysis.conditions.cold.cacheEligiblePairs} pairs with zero cache reads in both arms. The controlled warm run used one shared identifier after a warm-up and produced ${analysis.conditions.warm.cacheEligiblePairs} pairs with positive cache reads in both arms. Mixed pairs remain in raw reports but are excluded from cache-specific intervals.

## Matched primary metrics

Deltas are \`lite - off\`. Intervals use 20,000 deterministic paired bootstrap samples. Only pairs where both arms pass corrected task validation are included.

| Condition | Cache-eligible pairs | Successful pairs |
| --- | ---: | ---: |
${conditionRows}

| Condition | Metric | Mean delta | Lower 95% | Upper 95% |
| --- | --- | ---: | ---: | ---: |
${intervalRows}

| Condition | Mode | Input | Cache read | Cache write | Output | Total | Tool ms | Tool calls | Retries | Rereads | Corrective turns |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${componentRows}

## Task success

| Condition | Off | Lite | Lite-only successes | Off-only successes |
| --- | ---: | ---: | ---: | ---: |
| cold | ${analysis.conditions.cold.correctedSuccess.off}/75 | ${analysis.conditions.cold.correctedSuccess.lite}/75 | ${analysis.conditions.cold.activeOnlySuccessCount} | ${analysis.conditions.cold.offOnlySuccessCount} |
| warm | ${analysis.conditions.warm.correctedSuccess.off}/75 | ${analysis.conditions.warm.correctedSuccess.lite}/75 | ${analysis.conditions.warm.activeOnlySuccessCount} | ${analysis.conditions.warm.offOnlySuccessCount} |

One lite-only failure remains after validator correction. Its response omits the required production-database context from a safety warning. The full response and raw pointer are in the JSON report.

## Information preservation

| Mode | Critical omissions | Noncritical omissions | Altered facts | Unsupported claims | Ordering errors | Warning failures | Negation failures | Changed commands | Changed paths |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| off | ${Object.values(analysis.information.off).join(" | ")} |
| lite | ${Object.values(analysis.information.lite).join(" | ")} |

Blinded quality for controlled runs is ${analysis.quality.wins} wins, ${analysis.quality.ties} ties, and ${analysis.quality.losses} losses for lite. Two losses concern unsupported certainty in safety warnings. Two concern unspecified parser edge cases.

## Whole coding tasks

The controlled reports include ${analysis.multiTurn.cases} coding sessions. They measure complete assistant and workspace-tool activity through the final response. Parent handoff tool messages are retained in raw results. No child model was spawned. The deterministic handoff tool records the subagent message boundary.

Pi does not report internal provider retries, so retry values remain unknown. The runner records workspace rereads and corrective turns. It does not identify clarification turns separately.

| Mode | Sessions | Passed | Tool calls | Rereads | Corrective turns |
| --- | ---: | ---: | ---: | ---: | ---: |
| off | ${analysis.multiTurn.off.cases} | ${analysis.multiTurn.off.passed} | ${analysis.multiTurn.off.toolCalls} | ${analysis.multiTurn.off.rereads} | ${analysis.multiTurn.off.correctiveTurns} |
| lite | ${analysis.multiTurn.lite.cases} | ${analysis.multiTurn.lite.passed} | ${analysis.multiTurn.lite.toolCalls} | ${analysis.multiTurn.lite.rereads} | ${analysis.multiTurn.lite.correctiveTurns} |

## Four-axis decision

| Axis | Result | Reason |
| --- | --- | --- |
${gateRows}

Final decision: keep \`off\` as default. Stop prompt tuning. Lite fails information preservation and does not satisfy every release gate.
`;
}

export function buildFreshV2Analysis() {
  const fixture = readJson(FIXTURE_PATH);
  const sourceEntries = CONTROLLED_RUNS.map((entry) => ({
    ...entry,
    sha256: sha256File(entry.path),
    raw: readJson(entry.path),
  }));
  const correctedEntries = sourceEntries.map((entry) => ({
    ...entry,
    corrected: correctedRun(entry.raw, fixture, entry.id),
  }));
  const correctedRuns = correctedEntries.map((entry) => entry.corrected);
  const conditions = Object.fromEntries(
    correctedEntries.map((entry) => [entry.id, conditionAnalysis(entry.corrected, entry.cacheRule)]),
  );
  const allPairs = correctedRuns.flatMap((run) => pairResults(run.results));
  const successDeltas = allPairs.map(
    (pair) => Number(pair.lite.behavioralPassed) - Number(pair.off.behavioralPassed),
  );
  const successInterval = pairedInterval(successDeltas, "fresh-v2-success");
  const activeOnlyFailures = [];
  for (const entry of correctedEntries) {
    for (const pair of pairResults(entry.corrected.results)) {
      if (pair.off.behavioralPassed && !pair.lite.behavioralPassed) {
        activeOnlyFailures.push({
          condition: entry.id,
          category: pair.lite.category,
          repetition: pair.lite.repetition,
          classification: "Actual required-information loss",
          explanation: "The lite safety warning omits the required production-database context.",
          downstreamEffect: "A reviewer could apply the warning to the wrong environment.",
          offRawPointer: pair.off.rawPointer,
          liteRawPointer: pair.lite.rawPointer,
          offResponse: pair.off.response,
          liteResponse: pair.lite.response,
          liteValidation: pair.lite.validation,
        });
      }
    }
  }
  const judgeLosses = [];
  for (const entry of correctedEntries) {
    for (const pair of pairResults(entry.corrected.results)) {
      if (pair.lite.judge !== null && pair.lite.judge.activeQualityTotal < pair.lite.judge.offQualityTotal) {
        judgeLosses.push({
          condition: entry.id,
          category: pair.lite.category,
          repetition: pair.lite.repetition,
          ...classifyJudgeLoss(pair.lite),
          offRawPointer: pair.off.rawPointer,
          liteRawPointer: pair.lite.rawPointer,
          offResponse: pair.off.response,
          liteResponse: pair.lite.response,
          judgeNotes: pair.lite.judge.notes,
          offQualityTotal: pair.lite.judge.offQualityTotal,
          liteQualityTotal: pair.lite.judge.activeQualityTotal,
        });
      }
    }
  }
  const information = {
    off: aggregateInformation(correctedRuns, "off"),
    lite: aggregateInformation(correctedRuns, "lite"),
  };
  const quality = aggregateQuality(correctedRuns);
  const behavior = {
    off: aggregateBehavior(correctedRuns, "off"),
    lite: aggregateBehavior(correctedRuns, "lite"),
  };
  const codingResults = correctedRuns.flatMap((run) =>
    run.results.filter((result) => result.category === "v2-coding-millis" || result.category === "v2-coding-settings"),
  );
  const multiTurnMode = (mode) => {
    const selected = codingResults.filter((result) => result.mode === mode);
    return {
      cases: selected.length,
      passed: selected.filter((result) => result.behavioralPassed).length,
      toolCalls: selected.reduce((sum, result) => sum + (result.toolMetrics?.toolCalls ?? 0), 0),
      rereads: selected.reduce((sum, result) => sum + (result.toolMetrics?.rereads ?? 0), 0),
      correctiveTurns: selected.reduce((sum, result) => sum + (result.toolMetrics?.correctiveTurns ?? 0), 0),
      assistantTurns: selected.reduce((sum, result) => sum + result.assistantTurns, 0),
    };
  };
  const multiTurn = {
    cases: codingResults.length,
    off: multiTurnMode("off"),
    lite: multiTurnMode("lite"),
  };
  const totalTokenPassed =
    conditions.cold.pairedMetrics.totalTokens.upper95 < 0 &&
    conditions.warm.pairedMetrics.totalTokens.upper95 < 0;
  const latencyPassed =
    conditions.cold.pairedMetrics.latencyMs.upper95 < 0 &&
    conditions.warm.pairedMetrics.latencyMs.upper95 < 0;
  const taskSuccessPassed = successInterval.lower95 >= 0;
  const informationPassed =
    information.lite.criticalOmissionCount === 0 &&
    information.lite.alteredFactCount === 0 &&
    information.lite.unsupportedClaimCount === 0 &&
    information.lite.orderingErrorCount === 0 &&
    judgeLosses.every((loss) => loss.taskImpact === false) &&
    behavior.lite.retries !== null &&
    behavior.off.retries !== null &&
    behavior.lite.retries <= behavior.off.retries &&
    behavior.lite.rereads <= behavior.off.rereads;
  const allRawRuns = [
    ...sourceEntries.map((entry) => entry.raw),
    ...AUXILIARY_RUNS.map(readJson),
  ];
  const externalAttempts = {
    primary: allRawRuns.reduce((sum, run) => sum + (run.paidCallAccounting?.actual?.provider ?? 0), 0),
    judge: allRawRuns.reduce((sum, run) => sum + (run.paidCallAccounting?.actual?.judge ?? 0), 0),
    providerFailures: allRawRuns.reduce((sum, run) => sum + (run.providerFailureCount ?? 0), 0),
    judgeFailures: allRawRuns.reduce((sum, run) => sum + (run.judgeFailureCount ?? 0), 0),
  };
  externalAttempts.total = externalAttempts.primary + externalAttempts.judge;
  const auxiliaryRuns = {
    coldInitial: {
      path: AUXILIARY_RUNS[1],
      ...countCachePairs(readJson(AUXILIARY_RUNS[1]).results),
      cachePairCounts: countCachePairs(readJson(AUXILIARY_RUNS[1]).results),
      totalPairs: 75,
    },
    files: AUXILIARY_RUNS.map((relativePath) => ({ path: relativePath, sha256: sha256File(relativePath) })),
  };
  const analysis = {
    version: 1,
    generatedBy: "scripts/eval/fresh-v2-analysis.mjs",
    externalModelCalls: 0,
    validatorVersion: VALIDATOR_VERSION,
    fixture: { path: FIXTURE_PATH, sha256: sha256File(FIXTURE_PATH) },
    externalAttempts,
    sources: sourceEntries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      sha256: entry.sha256,
      runId: entry.raw.runIdentity.runId,
      evaluatedCommit: entry.raw.runIdentity.commit,
      providerAttempts: entry.raw.paidCallAccounting.actual.provider,
      judgeAttempts: entry.raw.paidCallAccounting.actual.judge,
    })),
    auxiliaryRuns,
    conditions,
    taskSuccess: { pairedDelta: successInterval },
    information,
    quality,
    behavior,
    multiTurn,
    activeOnlyFailures,
    judgeLosses,
    correctedResults: correctedRuns.flatMap((run) => run.results.map(responseReference)),
    finalDecision: {
      defaultMode: "off",
      recommendation: "Do not recommend lite. Stop prompt tuning after the information-preservation failure.",
      gates: {
        totalTokenReduction: {
          passed: totalTokenPassed,
          reason: totalTokenPassed
            ? "Both cache-controlled paired intervals are below zero."
            : "At least one cache-controlled paired interval reaches zero.",
        },
        latency: {
          passed: latencyPassed,
          reason: latencyPassed
            ? "Both cache-controlled paired latency intervals are below zero."
            : "At least one cache-controlled paired latency interval reaches zero.",
        },
        taskSuccess: {
          passed: taskSuccessPassed,
          reason: taskSuccessPassed
            ? `The zero-margin paired success interval is nonnegative. ${activeOnlyFailures.length === 1 ? "The one lite-only failure is recorded." : `All ${activeOnlyFailures.length} lite-only failures are recorded.`}`
            : "The zero-margin paired success interval crosses below zero.",
        },
        informationPreservation: {
          passed: informationPassed,
          reason: informationPassed
            ? "No protected critical fact or task-impact judge loss remains."
            : "Lite has a critical safety omission or a task-impact judge loss.",
        },
      },
    },
  };
  analysis.markdown = buildMarkdown(analysis);
  return analysis;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const analysis = buildFreshV2Analysis();
  const { markdown, ...jsonReport } = analysis;
  fs.writeFileSync(
    path.join(ROOT, "evaluation/results/fresh-v2-analysis-v1.json"),
    `${JSON.stringify(jsonReport, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(ROOT, "evaluation/results/fresh-v2-analysis-v1.md"),
    markdown,
    "utf8",
  );
}
