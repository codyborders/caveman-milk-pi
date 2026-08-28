import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateCompressionResults,
  aggregateResults,
  attributeBehaviorPairs,
  hashFixtureContent,
} from "../evaluate.mjs";
import { renderSummaryMarkdown, summarizeReport } from "./report-summary.mjs";
import { runRequirements } from "./validators.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REPORT = path.join(ROOT, "evaluation/results/benchmark-regression-v2.json");
const SOURCE_FIXTURE = path.join(ROOT, "evaluation/source-fixtures/benchmark-regression-v2.json");
const RESCORE_MANIFEST = path.join(ROOT, "evaluation/rescore-manifest.json");
const SOURCE_REPORT_HASH = "0e4a254968b0448b2df9e707d04c6bbc7c760c1b3b4a9dfb3ea07cfe6409feeb";
const SOURCE_FIXTURE_HASH = "da6ff6b621fa512301c954cc94850ca7a1ff3873766302c97ad69ec1cd4d0adb";
const VALIDATOR_VERSION = "schema4-corrected-v2";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function resolveOutput(envName, fallback) {
  const configured = process.env[envName];
  return path.resolve(configured === undefined ? path.join(ROOT, fallback) : configured);
}

function assertDifferentPaths({ source, output, markdownOutput }) {
  const resolvedSource = path.resolve(source);
  const resolvedOutput = path.resolve(output);
  const resolvedMarkdown = path.resolve(markdownOutput);
  if (resolvedOutput === resolvedSource || resolvedMarkdown === resolvedSource) {
    throw new Error("Rescore must not overwrite source report.");
  }
  if (resolvedOutput === resolvedMarkdown) {
    throw new Error("Rescore JSON and Markdown outputs must use different paths.");
  }
}

function readLockedInputs() {
  const reportBytes = readFileSync(SOURCE_REPORT);
  const reportHash = sha256(reportBytes);
  if (reportHash !== SOURCE_REPORT_HASH) {
    throw new Error(`Source report hash mismatch: expected ${SOURCE_REPORT_HASH}, got ${reportHash}`);
  }
  const fixtureText = readFileSync(SOURCE_FIXTURE, "utf8");
  const fixtureHash = hashFixtureContent(fixtureText);
  if (fixtureHash !== SOURCE_FIXTURE_HASH) {
    throw new Error(`Source fixture hash mismatch: expected ${SOURCE_FIXTURE_HASH}, got ${fixtureHash}`);
  }
  const source = JSON.parse(reportBytes.toString("utf8"));
  const fixtureDocument = JSON.parse(fixtureText);
  if (source.schemaVersion !== 4 || !Array.isArray(fixtureDocument.categories)) {
    throw new Error("Rescore requires a schema 4 source report and structured fixtures.");
  }
  if (source.fixtureHash !== SOURCE_FIXTURE_HASH) {
    throw new Error("Source report fixture hash does not match the locked source fixture.");
  }
  const categories = new Map(fixtureDocument.categories.map((category) => [category.id, category]));
  if (categories.size !== fixtureDocument.categories.length) {
    throw new Error("Locked source fixtures contain duplicate category identifiers.");
  }
  return { source, categories, reportHash, fixtureHash };
}

function correctedTaskClass(category) {
  if (category.id === "commit-pr") return "commit-pr";
  return category.taskClass;
}

function correctedRequirements(category) {
  const requirements = Array.isArray(category.requirements) ? [...category.requirements] : [];
  if (category.id === "file-writing" && !requirements.some((item) => item.kind === "paragraph-count")) {
    requirements.push({
      id: "paragraphs",
      kind: "paragraph-count",
      count: 1,
      includeHeadings: false,
      hardGroup: "contract",
      protected: true,
    });
  }
  return requirements;
}

export function rescoreStoredResult(result, category) {
  const requirements = correctedRequirements(category);
  const validationText = typeof result.validationText === "string" ? result.validationText : result.response;
  const validation = runRequirements(validationText, requirements, {
    toolCalls: result.toolCalls ?? [],
    expectsTool: category.expectsTool === true,
    requiredToolName: category.requiredToolName,
    requiredTerms: category.requiredTerms ?? [],
    taskClass: correctedTaskClass(category),
    artifactText: validationText,
  });
  const groups = {
    correctness: validation.groups.correctnessPass,
    groundedness: validation.groups.groundednessPass,
    contract: validation.groups.contractPass,
    safety: validation.groups.safetyPass,
  };
  const behavioralPassed = validation.passed && Object.values(groups).every(Boolean);
  return {
    ...result,
    validation,
    validationPassed: validation.passed,
    correctnessPass: groups.correctness,
    groundednessPass: groups.groundedness,
    contractPass: groups.contract,
    safetyPass: groups.safety,
    behavioralPassed,
    passed: behavioralPassed,
  };
}

function readRescoreManifest() {
  const manifest = JSON.parse(readFileSync(RESCORE_MANIFEST, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.validatorVersion !== VALIDATOR_VERSION) {
    throw new Error("Rescore manifest version does not match the validator.");
  }
  if (manifest.sourceReportHash !== SOURCE_REPORT_HASH || manifest.sourceFixtureHash !== SOURCE_FIXTURE_HASH) {
    throw new Error("Rescore manifest input hashes do not match locked inputs.");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.evaluatorCommit)) {
    throw new Error("Rescore manifest evaluator commit is invalid.");
  }
  if (Number.isNaN(Date.parse(manifest.generationTime))) {
    throw new Error("Rescore manifest generation time is invalid.");
  }
  return manifest;
}

export function buildRescoredReport() {
  const { source, categories, reportHash, fixtureHash } = readLockedInputs();
  const results = source.results.map((result) => {
    const category = categories.get(result.category);
    if (category === undefined) throw new Error(`Unknown source category: ${result.category}`);
    return rescoreStoredResult(result, category);
  });
  const expectedResultCount = source.modes.length * source.repetitions * categories.size;
  const runIntegrityPassed = source.primaryUsageComplete === true &&
    source.judgeFailures === 0 &&
    results.length === expectedResultCount;
  const passed = runIntegrityPassed && results.every((result) => result.behavioralPassed);
  const manifest = readRescoreManifest();
  return {
    ...source,
    passed,
    results,
    aggregates: aggregateResults(results, {
      pricing: source.pricing ?? null,
      judgeEnabled: source.judge?.enabled === true,
      schema4: true,
    }),
    compression: { byMode: aggregateCompressionResults(results) },
    attribution: attributeBehaviorPairs(results),
    rescore: {
      sourceReportHash: reportHash,
      sourceRunId: source.runId,
      validatorVersion: manifest.validatorVersion,
      fixtureHash,
      evaluatorCommit: manifest.evaluatorCommit,
      generationTime: manifest.generationTime,
      originalPaidConclusion: source.passed === true,
      rescoredConclusion: passed,
      externalModelCalls: 0,
    },
  };
}

function main() {
  const output = resolveOutput(
    "CAVEMAN_RESCORE_OUTPUT",
    "evaluation/results/benchmark-regression-v2-rescored.json",
  );
  const markdownOutput = resolveOutput(
    "CAVEMAN_RESCORE_MARKDOWN",
    "evaluation/results/benchmark-regression-v2-rescored.md",
  );
  assertDifferentPaths({ source: SOURCE_REPORT, output, markdownOutput });
  const report = buildRescoredReport();
  const markdown = renderSummaryMarkdown(summarizeReport(report));
  mkdirSync(path.dirname(output), { recursive: true });
  mkdirSync(path.dirname(markdownOutput), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownOutput, markdown, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
