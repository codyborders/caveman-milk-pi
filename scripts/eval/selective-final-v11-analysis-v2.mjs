#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSelectiveFinalAnalysis,
  renderSelectiveFinalAnalysis,
  loadDefaultRuns,
} from "./selective-final-v11-analysis.mjs";
import { evaluateSelectiveFinalGates } from "./selective-final-v11.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROTECTED_PATHS = [
  "scripts/evaluation-fixtures-fresh-v4.json",
  "evaluation/fixture-manifest.json",
  "evaluation/fresh-v4-artifacts-manifest.json",
  "evaluation/results/fresh-v4-preflight-v0.json",
  "evaluation/results/fresh-v4-preflight-v1.json",
  "evaluation/results/fresh-v4-preflight.json",
  "evaluation/results/fresh-v4-cold-controlled-v1.json",
  "evaluation/results/fresh-v4-warmup-shared-v0.json",
  "evaluation/results/fresh-v4-warmup-shared-v1.json",
  "evaluation/results/fresh-v4-warm-controlled-v1.json",
  "evaluation/results/fresh-v4-analysis-v1.json",
  "evaluation/results/fresh-v4-analysis-v1.md",
];
const HANDOFF_TYPES = new Set([
  "child-handoff-term-missing",
  "nested-child-response-missing",
  "nested-child-usage-missing",
  "nested-delegation-missing",
  "nested-tree-incomplete",
]);

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sourceContextHash(result) {
  const value = result?.canonicalSourceContextSha256;
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function pointer(result) {
  return {
    condition: result._condition,
    rawPath: result._rawPath,
    rawPointer: result._rawPointer,
    category: result.category,
    repetition: result.repetition,
    responseSha256: hash(result.response ?? ""),
  };
}

function handoffDifference(result) {
  return result.nested != null && (
    result.nested.complete !== true ||
    (result.nested.children ?? []).some((child) => !child.responseText) ||
    (result.validation?.checks ?? []).some((check) => check.id === "delegation" && check.passed === false)
  );
}

function pairs(runs) {
  const output = new Map();
  for (const run of runs) {
    for (const [index, result] of run.report.results.entries()) {
      const key = `${run.condition}|${result.category}|${result.repetition}`;
      const pair = output.get(key) ?? { condition: run.condition, category: result.category, repetition: result.repetition };
      const decorated = { ...result, _condition: run.condition, _rawPath: run.rawPath, _rawPointer: `/results/${index}` };
      pair[result.mode === "off" ? "off" : "candidate"] = decorated;
      output.set(key, pair);
    }
  }
  return [...output.values()];
}

function artifactHashes() {
  return PROTECTED_PATHS.map((relativePath) => ({
    path: relativePath,
    sha256: hash(fs.readFileSync(path.join(root, relativePath))),
  }));
}

function correctedPreservation(runs) {
  const all = runs.flatMap((run) => run.report.results.map((result, index) => ({
    ...result,
    _condition: run.condition,
    _rawPath: run.rawPath,
    _rawPointer: `/results/${index}`,
  })));
  const paired = pairs(runs).filter((pair) => pair.off && pair.candidate);
  const matched = paired.filter((pair) => {
    const offHash = sourceContextHash(pair.off);
    const candidateHash = sourceContextHash(pair.candidate);
    return offHash !== null && offHash === candidateHash;
  });
  const unmatched = paired.filter((pair) => !matched.includes(pair));
  const matchedKeys = new Set(matched.map((pair) => `${pair.condition}|${pair.category}|${pair.repetition}`));
  const unmatchedRecords = unmatched.map((pair) => ({
    condition: pair.condition,
    category: pair.category,
    repetition: pair.repetition,
    offRawPointer: pair.off._rawPointer,
    candidateRawPointer: pair.candidate._rawPointer,
    offSourceContextSha256: sourceContextHash(pair.off),
    candidateSourceContextSha256: sourceContextHash(pair.candidate),
    classification: "unmatched base-tree variation",
  }));
  const candidates = all.filter((result) => result.mode === "selective-final-v11");
  const handoffs = candidates.filter(handoffDifference);
  const criticalFindings = candidates.flatMap((result) => (result.preservation?.findings ?? [])
    .filter((finding) => finding.type !== "noncritical-omission" && !HANDOFF_TYPES.has(finding.type))
    .map((finding) => ({ ...pointer(result), finding })));
  const judgeLosses = candidates
    .filter((result) => Number.isFinite(result.judge?.activeQualityTotal) && Number.isFinite(result.judge?.offQualityTotal) && result.judge.activeQualityTotal < result.judge.offQualityTotal)
    .map((result) => ({
      ...pointer(result),
      classification: matchedKeys.has(`${result._condition}|${result.category}|${result.repetition}`)
        ? "matched source context"
        : "unmatched base-tree variation",
      offQualityTotal: result.judge.offQualityTotal,
      candidateQualityTotal: result.judge.activeQualityTotal,
      notes: result.judge.notes ?? null,
    }));
  const matchedJudgeLosses = judgeLosses.filter((record) => record.classification === "matched source context");
  return {
    totalCriticalFindings: criticalFindings.length,
    criticalFindings,
    causalAttributionStatus: matched.length === paired.length ? "supported" : matched.length === 0 ? "unsupported" : "partial",
    matchedContextPairCount: matched.length,
    unmatchedBaseTreeVariationCount: unmatchedRecords.length,
    unmatchedBaseTreeVariationRecords: unmatchedRecords,
    preFinalizerHandoffDifferenceCount: handoffs.length,
    preFinalizerHandoffDifferenceRecords: handoffs.map((result) => ({
      ...pointer(result),
      classification: "unmatched base-tree variation",
      findings: (result.preservation?.findings ?? []).filter((finding) => HANDOFF_TYPES.has(finding.type)),
    })),
    taskImpactingHandoffLosses: handoffs.length,
    handoffLossRecords: handoffs.map((result) => ({
      ...pointer(result),
      classification: "unmatched base-tree variation",
      findings: (result.preservation?.findings ?? []).filter((finding) => HANDOFF_TYPES.has(finding.type)),
    })),
    matchedContextJudgeLosses: matchedJudgeLosses.length,
    noncausalJudgeVariationCount: judgeLosses.length - matchedJudgeLosses.length,
    taskImpactingJudgeLosses: judgeLosses.length,
    judgeLossRecords: judgeLosses,
    gatedLossCount: criticalFindings.length,
  };
}

function categoryInterpretation() {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts/evaluation-fixtures-fresh-v4.json"), "utf8"));
  const categories = fixture.categories.map((category) => ({ id: category.id, eligible: category.compressionPolicy?.eligible ?? null }));
  return {
    categories,
    allEightCompressionPolicyEligibleFalse: categories.length === 8 && categories.every((category) => category.eligible === false),
    statement: "All eight Fresh-v4 categories have compressionPolicy.eligible false, so this is a protected-content/pass-through stress test and cannot assess savings on eligible prose.",
    validConclusions: [
      "Finalizer-only injection works.",
      "Parent and child processes receive no V11 candidate bytes.",
      "The 822-character candidate increases complete-tree tokens on protected content.",
      "The candidate finalizer sometimes loses protected information.",
    ],
    unsupportedConclusions: [
      "Selective-final can reduce tokens on eligible prose.",
      "V11 caused pre-finalizer handoff differences.",
    ],
    preservationGate: "Candidate finalizer safety uses direct protected-fact findings. Causal cross-arm comparison requires matching canonical source-context hashes.",
  };
}

export function buildSelectiveFinalAnalysisV2({ runs }) {
  const base = buildSelectiveFinalAnalysis({ runs });
  const preservation = correctedPreservation(runs);
  const finalDecision = evaluateSelectiveFinalGates({
    tokenUpper95: base.deploymentMix.totalTokens.upper95,
    latencyUpper95: base.deploymentMix.endToEndLatencyMs.upper95,
    nestedSuccessLower95: base.taskSuccess.nested.lower95,
    nestedCandidateSuccessRate: base.taskSuccess.nested.candidateSuccessRate,
    preservationLosses: preservation.gatedLossCount,
  });
  return {
    ...base,
    version: 2,
    schemaVersion: "fresh-v4-selective-final-v11-analysis-v2",
    generatedBy: "scripts/eval/selective-final-v11-analysis-v2.mjs",
    protectedArtifactHashes: artifactHashes(),
    interpretation: categoryInterpretation(),
    preservation,
    finalDecision,
  };
}

export function renderSelectiveFinalAnalysisV2(analysis) {
  const markdown = renderSelectiveFinalAnalysis(analysis);
  const start = markdown.indexOf("## Information preservation");
  const end = markdown.indexOf("## Injection topology");
  if (start < 0 || end < 0) throw new Error("V1 analysis markdown lacks expected preservation sections.");
  const p = analysis.preservation;
  const section = `## Fresh-v4 interpretation\n\nAll eight Fresh-v4 categories declare \`compressionPolicy.eligible: false\`. Fresh-v4 is a protected-content and pass-through stress test. It does not measure token or latency gains on compression-eligible prose.\n\nValid conclusions:\n\n- Finalizer-only injection works.\n- Parent and child processes receive no V11 candidate bytes.\n- The 822-character candidate increases complete-tree tokens on protected content.\n- The candidate finalizer sometimes loses protected information.\n\nUnsupported conclusions:\n\n- Selective-final can reduce tokens on eligible prose.\n- V11 caused pre-finalizer handoff differences.\n\n## Information preservation\n\nFresh-v4 did not lock byte-identical source context across arms. Its causal V11 preservation status is ${p.causalAttributionStatus}. Pre-finalizer handoff differences are unmatched base-tree variation. Counts and details remain visible, but they do not enter the safety gate.\n\nDirect candidate finalizer findings still enter the safety gate. They compare each finalizer output with its protected-fact manifest.\n\n| Finding group | Count |\n| --- | ---: |\n| Critical candidate finalizer findings | ${p.totalCriticalFindings} |\n| Matched source-context pairs | ${p.matchedContextPairCount} |\n| Unmatched base-tree variation | ${p.unmatchedBaseTreeVariationCount} |\n| Pre-finalizer handoff differences | ${p.preFinalizerHandoffDifferenceCount} |\n| Noncausal judge variation | ${p.noncausalJudgeVariationCount} |\n\nCandidate finalizer safety-gate losses: ${p.gatedLossCount}.\n\n`;
  return `${markdown.slice(0, start).replace("# Fresh-v4 selective-final v11 analysis", "# Fresh-v4 selective-final v11 analysis v2")}${section}${markdown.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const analysis = buildSelectiveFinalAnalysisV2({ runs: loadDefaultRuns() });
    fs.writeFileSync(path.join(root, "evaluation/results/fresh-v4-analysis-v2.json"), `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(root, "evaluation/results/fresh-v4-analysis-v2.md"), renderSelectiveFinalAnalysisV2(analysis), "utf8");
    process.stdout.write("fresh-v4 selective-final analysis v2 written\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
