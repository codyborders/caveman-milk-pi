#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessSelectiveFinalTopology,
  cacheEligibility,
  completeTreeLatency,
  evaluateSelectiveFinalGates,
  sumCompleteTreeUsage,
} from "./selective-final-v11.mjs";

export const BOOTSTRAP_SAMPLES = 20000;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function seedFrom(label, fallback = 1) {
  const digest = crypto.createHash("sha256").update(String(label)).digest();
  return digest.readUInt32BE(0) || fallback;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function pairedBootstrap(pairs, select, samples = BOOTSTRAP_SAMPLES, seed = 1) {
  const values = pairs.map(select).filter(Number.isFinite);
  if (values.length === 0) {
    return { count: 0, samples, mean: null, lower95: null, upper95: null };
  }
  const random = randomGenerator(seed);
  const estimates = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    estimates.push(total / values.length);
  }
  estimates.sort((left, right) => left - right);
  return {
    count: values.length,
    samples,
    mean: mean(values),
    lower95: percentile(estimates, 0.025),
    upper95: percentile(estimates, 0.975),
  };
}

function pairResults(results) {
  const pairs = new Map();
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const key = `${result._condition ?? "run"}|${result.repetition}|${result.category}`;
    const pair = pairs.get(key) ?? {
      key,
      repetition: result.repetition,
      category: result.category,
      nested: result.nested !== null && result.nested !== undefined,
    };
    pair[result.mode === "off" ? "off" : "candidate"] = {
      ...result,
      rawPointer: `/results/${index}`,
    };
    pairs.set(key, pair);
  }
  return [...pairs.values()];
}

function recordTopology(result) {
  const children = (result.nested?.children ?? []).map((child) => ({
    ...child,
    mode: child.mode ?? result.nested?.rootMode ?? null,
  }));
  return assessSelectiveFinalTopology({
    arm: result.mode,
    base: {
      mode: result.nested?.rootMode ?? "off",
      handoffComplete: result.nested === null || result.nested === undefined
        ? true
        : result.nested.complete === true,
    },
    children,
    finalizer: result.finalizer,
  });
}

function resultPasses(result) {
  const behavioralPassed = result?.behavioralPassed ?? result?.validation?.passed;
  return behavioralPassed === true && recordTopology(result).passed;
}

function pairMetric(pair, select) {
  if (pair.off === undefined || pair.candidate === undefined) return null;
  const off = select(pair.off);
  const candidate = select(pair.candidate);
  return Number.isFinite(off) && Number.isFinite(candidate) ? candidate - off : null;
}

function totalTokens(result) {
  return sumCompleteTreeUsage(result)?.total ?? null;
}

function latencyMs(result) {
  return completeTreeLatency({
    ...result,
    elapsedMs: result.baseElapsedMs ?? result.elapsedMs - (result.finalizer?.elapsedMs ?? 0),
  }).completeMs;
}

function conditionAnalysis(run) {
  const cacheRule = run.condition === "cold" ? "zero" : "positive";
  const pairs = pairResults(
    run.report.results.map((result) => ({ ...result, _condition: run.condition })),
  );
  const eligible = pairs.filter(
    (pair) =>
      pair.off !== undefined &&
      pair.candidate !== undefined &&
      cacheEligibility(pair.off, cacheRule) &&
      cacheEligibility(pair.candidate, cacheRule),
  );
  const successful = eligible.filter(
    (pair) => resultPasses(pair.off) && resultPasses(pair.candidate),
  );
  const tokenDeltas = successful.map((pair) => pairMetric(pair, totalTokens));
  const latencyDeltas = successful.map((pair) => pairMetric(pair, latencyMs));
  return {
    condition: run.condition,
    rawPath: run.rawPath,
    totalPairs: pairs.length,
    eligiblePairs: eligible.length,
    successfulPairs: successful.length,
    tokenDeltas,
    latencyDeltas,
    totalTokens: pairedBootstrap(
      successful,
      (pair) => pairMetric(pair, totalTokens),
      BOOTSTRAP_SAMPLES,
      seedFrom(`${run.condition}|tokens`),
    ),
    endToEndLatencyMs: pairedBootstrap(
      successful,
      (pair) => pairMetric(pair, latencyMs),
      BOOTSTRAP_SAMPLES,
      seedFrom(`${run.condition}|latency`),
    ),
    exclusions: pairs
      .filter((pair) => !successful.includes(pair))
      .map((pair) => ({
        key: pair.key,
        offRawPointer: pair.off?.rawPointer ?? null,
        candidateRawPointer: pair.candidate?.rawPointer ?? null,
        reasons: [
          ...(pair.off === undefined || pair.candidate === undefined ? ["missing arm"] : []),
          ...(pair.off !== undefined && !cacheEligibility(pair.off, cacheRule)
            ? ["off cache ineligible"]
            : []),
          ...(pair.candidate !== undefined && !cacheEligibility(pair.candidate, cacheRule)
            ? ["candidate cache ineligible"]
            : []),
          ...(pair.off !== undefined && !resultPasses(pair.off) ? ["off behavior or topology failure"] : []),
          ...(pair.candidate !== undefined && !resultPasses(pair.candidate)
            ? ["candidate behavior or topology failure"]
            : []),
        ],
      })),
  };
}

function deploymentMix(cold, warm, field, label) {
  const coldValues = cold[field];
  const warmValues = warm[field];
  if (coldValues.length === 0 || warmValues.length === 0) {
    return { count: 0, samples: BOOTSTRAP_SAMPLES, mean: null, lower95: null, upper95: null };
  }
  const random = randomGenerator(seedFrom(label));
  const estimates = [];
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample += 1) {
    let coldTotal = 0;
    let warmTotal = 0;
    for (let index = 0; index < coldValues.length; index += 1) {
      coldTotal += coldValues[Math.floor(random() * coldValues.length)];
    }
    for (let index = 0; index < warmValues.length; index += 1) {
      warmTotal += warmValues[Math.floor(random() * warmValues.length)];
    }
    estimates.push(0.5 * coldTotal / coldValues.length + 0.5 * warmTotal / warmValues.length);
  }
  estimates.sort((left, right) => left - right);
  return {
    count: coldValues.length + warmValues.length,
    samples: BOOTSTRAP_SAMPLES,
    mean: 0.5 * mean(coldValues) + 0.5 * mean(warmValues),
    lower95: percentile(estimates, 0.025),
    upper95: percentile(estimates, 0.975),
  };
}

function successAnalysis(results, nested) {
  const pairs = pairResults(results).filter((pair) => pair.nested === nested);
  const paired = pairs.filter(
    (pair) => pair.off !== undefined && pair.candidate !== undefined,
  );
  return {
    ...pairedBootstrap(
      paired,
      (pair) => Number(resultPasses(pair.candidate)) - Number(resultPasses(pair.off)),
      BOOTSTRAP_SAMPLES,
      seedFrom(nested ? "nested-success" : "direct-success"),
    ),
    offPassed: paired.filter((pair) => resultPasses(pair.off)).length,
    candidatePassed: paired.filter((pair) => resultPasses(pair.candidate)).length,
    pairCount: paired.length,
    candidateSuccessRate:
      paired.length === 0
        ? null
        : paired.filter((pair) => resultPasses(pair.candidate)).length / paired.length,
  };
}

const INTER_AGENT_FINDING_TYPES = new Set([
  "child-handoff-term-missing",
  "nested-child-response-missing",
  "nested-child-usage-missing",
  "nested-delegation-missing",
  "nested-tree-incomplete",
]);

function isCriticalFinding(finding) {
  return (
    finding?.type !== "noncritical-omission" &&
    !INTER_AGENT_FINDING_TYPES.has(finding?.type)
  );
}

export function buildSelectiveFinalAnalysis({ runs }) {
  const byName = Object.fromEntries(runs.map((run) => [run.condition, conditionAnalysis(run)]));
  if (byName.cold === undefined || byName.warm === undefined) {
    throw new Error("Selective-final analysis requires cold and warm runs.");
  }
  const allResults = runs.flatMap((run) =>
    run.report.results.map((result, index) => ({
      ...result,
      _condition: run.condition,
      _rawPath: run.rawPath,
      _rawPointer: `/results/${index}`,
    })),
  );
  const candidateResults = allResults.filter((result) => result.mode === "selective-final-v11");
  const criticalFindings = candidateResults.flatMap((result) =>
    (result.preservation?.findings ?? []).filter(isCriticalFinding).map((finding) => ({
      condition: result._condition ?? null,
      rawPath: result._rawPath ?? null,
      rawPointer: result._rawPointer ?? null,
      responseSha256: crypto.createHash("sha256").update(result.response ?? "").digest("hex"),
      category: result.category,
      repetition: result.repetition,
      finding,
    })),
  );
  const handoffLosses = candidateResults.filter(
    (result) =>
      result.nested !== null &&
      result.nested !== undefined &&
      (result.nested.complete !== true ||
        (result.nested.children ?? []).some((child) => !child.responseText) ||
        (result.validation?.checks ?? []).some(
          (check) => check.id === "delegation" && check.passed === false,
        )),
  );
  const judgeLosses = candidateResults.filter(
    (result) =>
      Number.isFinite(result.judge?.activeQualityTotal) &&
      Number.isFinite(result.judge?.offQualityTotal) &&
      result.judge.activeQualityTotal < result.judge.offQualityTotal,
  );
  const handoffLossRecords = handoffLosses.map((result) => ({
    condition: result._condition,
    rawPath: result._rawPath,
    rawPointer: result._rawPointer,
    category: result.category,
    repetition: result.repetition,
    responseSha256: crypto.createHash("sha256").update(result.response ?? "").digest("hex"),
    findings: (result.preservation?.findings ?? []).filter((finding) =>
      INTER_AGENT_FINDING_TYPES.has(finding.type),
    ),
  }));
  const judgeLossRecords = judgeLosses.map((result) => ({
    condition: result._condition,
    rawPath: result._rawPath,
    rawPointer: result._rawPointer,
    category: result.category,
    repetition: result.repetition,
    responseSha256: crypto.createHash("sha256").update(result.response ?? "").digest("hex"),
    offQualityTotal: result.judge.offQualityTotal,
    candidateQualityTotal: result.judge.activeQualityTotal,
    notes: result.judge.notes ?? null,
  }));
  const offResults = allResults.filter((result) => result.mode === "off");
  const candidateInjectedNodes = candidateResults.reduce(
    (sum, result) => sum + (result.finalizer?.injectedCandidateNodes ?? 0),
    0,
  );
  const offInjectedNodes = offResults.reduce(
    (sum, result) => sum + (result.finalizer?.injectedCandidateNodes ?? 0),
    0,
  );
  const candidateNonFinalizerInjectedNodes = candidateResults.filter(
    (result) =>
      (result.nested?.rootMode ?? "off") !== "off" ||
      (result.nested?.children ?? []).some(
        (child) => (child.mode ?? result.nested?.rootMode) !== "off",
      ),
  ).length;
  const taskSuccess = {
    direct: successAnalysis(allResults, false),
    nested: successAnalysis(allResults, true),
  };
  const deployment = {
    totalTokens: deploymentMix(byName.cold, byName.warm, "tokenDeltas", "mix|tokens"),
    endToEndLatencyMs: deploymentMix(
      byName.cold,
      byName.warm,
      "latencyDeltas",
      "mix|latency",
    ),
  };
  const preservationLossCount = criticalFindings.length + handoffLosses.length + judgeLosses.length;
  const finalDecision = evaluateSelectiveFinalGates({
    tokenUpper95: deployment.totalTokens.upper95,
    latencyUpper95: deployment.endToEndLatencyMs.upper95,
    nestedSuccessLower95: taskSuccess.nested.lower95,
    nestedCandidateSuccessRate: taskSuccess.nested.candidateSuccessRate,
    preservationLosses: preservationLossCount,
  });
  return {
    version: 1,
    schemaVersion: "fresh-v4-selective-final-v11-analysis-v1",
    generatedBy: "scripts/eval/selective-final-v11-analysis.mjs",
    bootstrapSamples: BOOTSTRAP_SAMPLES,
    sources: runs.map((run) => ({
      condition: run.condition,
      path: run.rawPath,
      sha256: run.sha256 ?? null,
      caseCount: run.report.caseCount ?? run.report.results.length,
    })),
    processAccounting: runs.reduce(
      (totals, run) => ({
        provider: totals.provider + (run.report.paidCallAccounting?.actual?.provider ?? 0),
        judge: totals.judge + (run.report.paidCallAccounting?.actual?.judge ?? 0),
        total: totals.total + (run.report.paidCallAccounting?.actual?.total ?? 0),
        providerFailures: totals.providerFailures + (run.report.failures?.length ?? 0),
        judgeFailures: totals.judgeFailures + (run.report.judgeFailures ?? 0),
      }),
      { provider: 0, judge: 0, total: 0, providerFailures: 0, judgeFailures: 0 },
    ),
    conditions: { cold: byName.cold, warm: byName.warm },
    deploymentMix: deployment,
    taskSuccess,
    preservation: {
      totalCriticalFindings: criticalFindings.length,
      criticalFindings,
      taskImpactingHandoffLosses: handoffLosses.length,
      handoffLossRecords,
      taskImpactingJudgeLosses: judgeLosses.length,
      judgeLossRecords,
    },
    injectionAudit: {
      offInjectedNodes,
      candidateInjectedNodes,
      candidateNonFinalizerInjectedNodes,
      candidateFinalizerCharacters: [...new Set(candidateResults.map((result) => result.finalizer?.injectedPromptCharacters ?? 0))],
    },
    finalDecision,
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

export function renderSelectiveFinalAnalysis(analysis) {
  const gate = (name) => analysis.finalDecision.gates[name] ? "PASS" : "FAIL";
  const conditionRow = (label, condition) =>
    `| ${label} | ${condition.eligiblePairs} | ${condition.successfulPairs} | ${format(condition.totalTokens.mean)} | ${format(condition.totalTokens.lower95)} | ${format(condition.totalTokens.upper95)} | ${format(condition.endToEndLatencyMs.mean)} | ${format(condition.endToEndLatencyMs.lower95)} | ${format(condition.endToEndLatencyMs.upper95)} |`;
  const successRow = (label, success) =>
    `| ${label} | ${success.pairCount} | ${success.offPassed} | ${success.candidatePassed} | ${Number.isFinite(success.candidateSuccessRate) ? success.candidateSuccessRate.toFixed(3) : "n/a"} | ${Number.isFinite(success.mean) ? success.mean.toFixed(3) : "n/a"} | ${Number.isFinite(success.lower95) ? success.lower95.toFixed(3) : "n/a"} | ${Number.isFinite(success.upper95) ? success.upper95.toFixed(3) : "n/a"} |`;
  return `# Fresh-v4 selective-final v11 analysis

Fresh-v4 compares \`off\` with \`selective-final-v11\`. Every base parent and child runs with Caveman off. Only the tools-disabled finalizer receives v11.

Deltas are \`selective-final-v11 - off\`. Total tokens include input, cache read, cache write, and output tokens for each parent, child, and finalizer once.

Intervals use ${analysis.bootstrapSamples.toLocaleString("en-US")} deterministic paired bootstrap samples. Primary token and latency metrics use cache-eligible pairs where both arms pass behavior and topology checks.

Controlled cold and warm runs used ${analysis.processAccounting.provider} primary processes and ${analysis.processAccounting.judge} judge processes. Provider failures: ${analysis.processAccounting.providerFailures}. Judge failures: ${analysis.processAccounting.judgeFailures}.

## Controlled conditions

| Condition | Eligible pairs | Successful pairs | Token delta | Token lower 95% | Token upper 95% | Latency delta ms | Latency lower 95% | Latency upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${conditionRow("Cold", analysis.conditions.cold)}
${conditionRow("Warm", analysis.conditions.warm)}

Mixed and ineligible pairs remain in raw reports with pointers and exclusion reasons.

## Declared deployment mix

The deployment mix weights cold and warm conditions equally.

| Metric | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: |
| Complete-tree tokens | ${analysis.deploymentMix.totalTokens.count} | ${format(analysis.deploymentMix.totalTokens.mean)} | ${format(analysis.deploymentMix.totalTokens.lower95)} | ${format(analysis.deploymentMix.totalTokens.upper95)} |
| End-to-end latency ms | ${analysis.deploymentMix.endToEndLatencyMs.count} | ${format(analysis.deploymentMix.endToEndLatencyMs.mean)} | ${format(analysis.deploymentMix.endToEndLatencyMs.lower95)} | ${format(analysis.deploymentMix.endToEndLatencyMs.upper95)} |

## Task success

| Group | Pairs | Off passed | Candidate passed | Candidate rate | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${successRow("Direct", analysis.taskSuccess.direct)}
${successRow("Nested", analysis.taskSuccess.nested)}

Nested non-inferiority requires a lower bound of at least zero. The candidate must also pass every nested task.

## Information preservation

| Finding group | Count |
| --- | ---: |
| Critical final-response findings | ${analysis.preservation.totalCriticalFindings} |
| Task-impacting handoff losses | ${analysis.preservation.taskImpactingHandoffLosses} |
| Task-impacting blinded-judge losses | ${analysis.preservation.taskImpactingJudgeLosses} |

Full final responses, base responses, child requests, child responses, judge notes, raw pointers, and hashes remain in raw reports.

## Injection topology

- Off finalizer injections: ${analysis.injectionAudit.offInjectedNodes}
- Candidate finalizer injections: ${analysis.injectionAudit.candidateInjectedNodes}
- Candidate injections outside finalizers: ${analysis.injectionAudit.candidateNonFinalizerInjectedNodes}
- Candidate finalizer characters: ${analysis.injectionAudit.candidateFinalizerCharacters.join(", ")}

## Release gates

| Gate | Result |
| --- | --- |
| Total-token reduction | ${gate("totalTokens")} |
| End-to-end latency | ${gate("latency")} |
| Nested task success | ${gate("nestedSuccess")} |
| Information preservation | ${gate("preservation")} |

Final decision: ${analysis.finalDecision.passed ? "candidate passes every gate" : "keep mode off"}.
`;
}

export function loadDefaultRuns() {
  return [
    ["cold", "evaluation/results/fresh-v4-cold-controlled-v1.json"],
    ["warm", "evaluation/results/fresh-v4-warm-controlled-v1.json"],
  ].map(([condition, rawPath]) => {
    const bytes = fs.readFileSync(path.join(root, rawPath));
    return {
      condition,
      rawPath,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      report: JSON.parse(bytes.toString("utf8")),
    };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const analysis = buildSelectiveFinalAnalysis({ runs: loadDefaultRuns() });
    const markdown = renderSelectiveFinalAnalysis(analysis);
    fs.writeFileSync(
      path.join(root, "evaluation/results/fresh-v4-analysis-v1.json"),
      `${JSON.stringify(analysis, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "evaluation/results/fresh-v4-analysis-v1.md"),
      markdown,
      "utf8",
    );
    process.stdout.write("fresh-v4 selective-final analysis written\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
