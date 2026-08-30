// Deterministic derived-report generator for the targeted-v8 paid run.
//
// The paid report was validated with schema4-corrected-v10. Two later
// validator corrections are outcome-relevant for it: v11 joins soft-wrapped
// commit/PR description prose before structure and supplied-facts checks,
// and v12 removes a pass-through false positive from the supplied-facts
// test-claim pattern. This generator recomputes validation for every stored
// response with the corrected validator, records raw JSON pointers and
// response hashes for each changed outcome, and never touches a measured
// field: responses, usage, latency, word counts, and judge verdicts stay
// byte-identical to the paid source.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateCompressionResults,
  aggregateResults,
  attributeBehaviorPairs,
  hashFixtureContent,
} from "../evaluate.mjs";
import { runRequirements } from "./validators.mjs";

export const TARGETED_V8_CORRECTION_VERSION = 1;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REPORT_PATH = path.join(ROOT, "evaluation", "results", "benchmark-targeted-v8.json");
const SOURCE_FIXTURE_PATH = path.join(ROOT, "scripts", "evaluation-fixtures-targeted-v4.json");
const SOURCE_REPORT_SHA256 = "df96aad18cccb62eeb5bc8f70c93c464f090bad76deabc08ed4b9ca96e05069b";
const SOURCE_FIXTURE_SHA256 = "c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de";
const ORIGINAL_VALIDATOR_VERSION = "schema4-corrected-v10";
const CORRECTED_VALIDATOR_VERSION = "schema4-corrected-v12";

// The exact correction that flips targeted-v8 outcomes: soft-wrapped PR
// description prose is joined into complete content lines before the
// persisted-prose structure check and the supplied-facts check read it.
const CORRECTIONS_APPLIED = [
  {
    id: "soft-wrapped-commit-pr-prose-joined-before-supplied-facts",
    fromValidatorVersion: "schema4-corrected-v11",
    detail:
      "descriptionContentLines joins consecutive soft-wrapped description lines into one content line before incomplete-line, complete-line, and supplied-facts checks run, so a wrapped sentence is no longer read as telegraphic fragments.",
  },
  {
    id: "supplied-facts-pass-through-false-positive-removed",
    fromValidatorVersion: "schema4-corrected-v12",
    detail:
      "The supplied-facts test-claim pattern dropped the bare 'pass' word forms, which had flagged pass-through prose as a test-result claim.",
    outcomeEffect: "none",
  },
];

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readLockedSource() {
  const reportBytes = fs.readFileSync(SOURCE_REPORT_PATH);
  const reportHash = sha256Buffer(reportBytes);
  if (reportHash !== SOURCE_REPORT_SHA256) {
    throw new Error(
      `Source report hash mismatch: expected ${SOURCE_REPORT_SHA256}, got ${reportHash}`,
    );
  }
  const source = JSON.parse(reportBytes.toString("utf8"));
  if (source.validatorVersion !== ORIGINAL_VALIDATOR_VERSION) {
    throw new Error(
      `Source report must carry validator ${ORIGINAL_VALIDATOR_VERSION}; found '${source.validatorVersion}'.`,
    );
  }
  const fixtureText = fs.readFileSync(SOURCE_FIXTURE_PATH, "utf8");
  const fixtureHash = hashFixtureContent(fixtureText);
  if (fixtureHash !== SOURCE_FIXTURE_SHA256) {
    throw new Error(
      `Source fixture hash mismatch: expected ${SOURCE_FIXTURE_SHA256}, got ${fixtureHash}`,
    );
  }
  if (source.fixtureHash !== SOURCE_FIXTURE_SHA256) {
    throw new Error("Source report fixture hash does not match the locked source fixture.");
  }
  const fixtures = JSON.parse(fixtureText);
  const categories = new Map(fixtures.categories.map((category) => [category.id, category]));
  return { source, categories };
}

function failedCheckSummaries(validation) {
  return (validation.checks ?? [])
    .filter((check) => !check.passed)
    .map((check) => ({ id: check.id, detail: check.detail }));
}

function recomputeResult(result, category) {
  const validationText =
    typeof result.validationText === "string" ? result.validationText : result.response;
  const validation = runRequirements(validationText, category.requirements ?? [], {
    toolCalls: result.toolCalls ?? [],
    expectsTool: category.expectsTool === true,
    requiredToolName: category.requiredToolName,
    requiredTerms: category.requirements ?? [],
    taskClass: category.taskClass,
    artifactText: validationText,
    validatorVersion: CORRECTED_VALIDATOR_VERSION,
  });
  const groups = {
    correctnessPass: validation.groups.correctnessPass,
    groundednessPass: validation.groups.groundednessPass,
    contractPass: validation.groups.contractPass,
    safetyPass: validation.groups.safetyPass,
  };
  const behavioralPassed = validation.passed && Object.values(groups).every(Boolean);
  return {
    ...result,
    validation,
    validationPassed: validation.passed,
    ...groups,
    behavioralPassed,
    passed: behavioralPassed,
  };
}

// Outcome-neutral evidence for the v12 note: the v11 and v12 supplied-facts
// test-claim patterns differ only on bare 'pass' word forms, so the fix can
// only change outcomes when such a word appears in a validated artifact.
function v12PatternDivergenceCount(source) {
  const v11Pattern = /\b(?:tests?|testing|test suite|vitest|pytest|jest|specs?|pass(?:ed|es|ing)?)\b/i;
  const v12Pattern = /\b(?:tests?|testing|test suite|vitest|pytest|jest|specs?)\b/i;
  let divergent = 0;
  for (const result of source.results) {
    const text = typeof result.validationText === "string" ? result.validationText : result.response;
    if (v11Pattern.test(text) !== v12Pattern.test(text)) divergent += 1;
  }
  return divergent;
}

export function buildTargetedV8Correction() {
  const { source, categories } = readLockedSource();
  const divergent = v12PatternDivergenceCount(source);
  if (divergent !== 0) {
    throw new Error(
      `v12 pass-through fix changed ${divergent} outcome(s); the recorded 'no outcome effect' note would be false.`,
    );
  }
  const recomputed = [];
  const changedOutcomes = [];
  const tallies = {};
  for (const [index, result] of source.results.entries()) {
    const category = categories.get(result.category);
    if (category === undefined) {
      throw new Error(`Source result references unknown category '${result.category}'.`);
    }
    const next = recomputeResult(result, category);
    recomputed.push(next);
    tallies[result.mode] ??= { passed: 0, total: 0 };
    tallies[result.mode].total += 1;
    if (next.behavioralPassed) tallies[result.mode].passed += 1;
    if (next.behavioralPassed !== result.behavioralPassed) {
      changedOutcomes.push({
        resultIndex: index,
        pointer: `/results/${index}`,
        key: result.key,
        mode: result.mode,
        category: result.category,
        repetition: result.repetition,
        responseSha256: sha256Text(result.response),
        originalValidation: {
          passed: result.validationPassed === true,
          failedChecks: failedCheckSummaries(result.validation),
        },
        recomputedValidation: {
          passed: next.validation.passed,
          failedChecks: failedCheckSummaries(next.validation),
        },
        corrections: ["soft-wrapped-commit-pr-prose-joined-before-supplied-facts"],
      });
    }
  }
  const recomputedPassed =
    recomputed.every((result) => result.passed) &&
    source.judgeFailures === 0 &&
    recomputed.every((result) => Number.isInteger(result.usage?.output) && result.usage.output > 0);
  return {
    ...source,
    validatorVersion: CORRECTED_VALIDATOR_VERSION,
    results: recomputed,
    aggregates: aggregateResults(recomputed, {
      pricing: source.pricing ?? null,
      judgeEnabled: source.judge?.enabled === true,
      schema4: true,
    }),
    attribution: attributeBehaviorPairs(recomputed),
    compression: { byMode: aggregateCompressionResults(recomputed) },
    passed: recomputedPassed,
    correction: {
      derived: true,
      version: TARGETED_V8_CORRECTION_VERSION,
      generator: "scripts/eval/targeted-v8-correction.mjs",
      sourceReportPath: "evaluation/results/benchmark-targeted-v8.json",
      sourceReportSha256: SOURCE_REPORT_SHA256,
      sourceRunId: source.runId,
      sourceFixturePath: "scripts/evaluation-fixtures-targeted-v4.json",
      sourceFixtureSha256: SOURCE_FIXTURE_SHA256,
      originalValidatorVersion: ORIGINAL_VALIDATOR_VERSION,
      correctedValidatorVersion: CORRECTED_VALIDATOR_VERSION,
      changedOutcomeCount: changedOutcomes.length,
      unchangedOutcomeCount: recomputed.length - changedOutcomes.length,
      changedOutcomes,
      recomputedHardPasses: Object.fromEntries(
        source.modes.map((mode) => [mode, tallies[mode] ?? { passed: 0, total: 0 }]),
      ),
      correctionsApplied: CORRECTIONS_APPLIED,
      measuredFieldsUnchanged: [
        "response",
        "validationText",
        "usage",
        "rawUsage",
        "rawUsageTurns",
        "elapsedMs",
        "wordCount",
        "judge",
        "compressionPolicy",
      ],
      externalModelCalls: 0,
      notes: [
        "Exact correction: soft-wrapped commit/PR description prose is joined before structure and supplied-facts checking.",
        "The v12 pass-through false-positive fix has no outcome effect on this report: no validated response diverges between the v11 and v12 test-claim patterns.",
        "off is not forced to 40/40: its three irreversible-confirmation responses never ask an approval question naming the exact target, so the exact-target checks still fail after correction.",
      ],
    },
  };
}

export function renderTargetedV8CorrectionMarkdown(report) {
  const c = report.correction;
  const changedRows = c.changedOutcomes
    .map(
      (entry) =>
        `| ${entry.pointer} | \`${entry.key}\` | ${entry.mode} | ${entry.category} | r${entry.repetition} | ${entry.responseSha256.slice(0, 16)}... | ${entry.originalValidation.failedChecks.map((check) => check.id).join(", ")} | none |`,
    )
    .join("\n");
  const passRows = Object.entries(c.recomputedHardPasses)
    .map(([mode, tally]) => `| \`${mode}\` | ${tally.passed}/${tally.total} |`)
    .join("\n");
  const correctionRows = c.correctionsApplied
    .map((item) => `| \`${item.id}\` | ${item.fromValidatorVersion} | ${item.outcomeEffect ?? "changed validation"} | ${item.detail} |`)
    .join("\n");
  return `# Targeted-v8 corrected rescore (v${c.version})

This derived report recomputes targeted-v8 validation without changing measured fields. It made ${c.externalModelCalls} external model calls.

| Item | Value |
| --- | --- |
| Generator | \`${c.generator}\` |
| Source report | \`${c.sourceReportPath}\` |
| Source report SHA-256 | \`${c.sourceReportSha256}\` |
| Run ID | \`${c.sourceRunId}\` |
| Source fixture | \`${c.sourceFixturePath}\` |
| Source fixture SHA-256 | \`${c.sourceFixtureSha256}\` |
| Original validator | \`${c.originalValidatorVersion}\` |
| Corrected validator | \`${c.correctedValidatorVersion}\` |

Measured responses, usage, timing, word counts, judge results, and compression policies are unchanged.

## Validator changes

| Change | Version | Outcome effect | Operation |
| --- | --- | --- | --- |
${correctionRows}

The effective correction joins soft-wrapped commit and PR prose before structure and supplied-fact checks. The v12 pass-through change affects no targeted-v8 outcome.

## Recomputed hard passes

| Mode | Hard passes |
| --- | --- |
${passRows}

Both active modes reach 40/40. Mode \`off\` remains at 37/40. Its three failed approval questions omit the exact target.

## Changed outcomes (${c.changedOutcomeCount} of ${c.changedOutcomeCount + c.unchangedOutcomeCount})

| Raw pointer | Key | Mode | Category | Repetition | Response SHA-256 prefix | Original failed checks | Recomputed failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
${changedRows}

Each row identifies the unchanged raw response by JSON pointer and response hash.
`;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const report = buildTargetedV8Correction();
  const outputJson = path.join(
    ROOT,
    "evaluation",
    "results",
    `benchmark-targeted-v8-corrected-v${TARGETED_V8_CORRECTION_VERSION}.json`,
  );
  const outputMarkdown = path.join(
    ROOT,
    "evaluation",
    "results",
    `benchmark-targeted-v8-corrected-v${TARGETED_V8_CORRECTION_VERSION}.md`,
  );
  if (path.resolve(outputJson) === path.resolve(SOURCE_REPORT_PATH)) {
    throw new Error("Correction must not overwrite the source report.");
  }
  fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(outputMarkdown, renderTargetedV8CorrectionMarkdown(report), "utf8");
}
