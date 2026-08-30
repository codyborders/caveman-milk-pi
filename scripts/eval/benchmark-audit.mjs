import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function valuesForRequirement(requirement) {
  return [
    requirement.value,
    requirement.marker,
    ...(Array.isArray(requirement.requiredTerms) ? requirement.requiredTerms : []),
    requirement.phrase,
    requirement.sentence,
    requirement.functionName,
    requirement.count,
    requirement.toolName,
    ...(Array.isArray(requirement.orderedTerms) ? requirement.orderedTerms : []),
  ].filter((value) => value !== undefined && value !== null);
}

function pilotIssue(results, { underSpecified, exempt }) {
  const diagnoses = [];
  if (underSpecified) diagnoses.push("Prompt lacked facts. Old judging rewarded unsupported specificity");
  if (exempt) diagnoses.push("Universal compression gate conflicted with the prompt exemption");
  const failed = results.find((result) => result.validationPassed === false || result.behavioralPassed === false);
  if (failed) diagnoses.push(`Hard check failure in ${failed.mode} arm`);
  else if (results.some((result) => result.judge?.failed === true)) diagnoses.push("Judge failure");
  if (diagnoses.length === 0) diagnoses.push("Old compression or judge scores were coupled to hard status");
  return diagnoses.join(". ");
}

function cell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildBenchmarkAudit({ report, pilotFixtures, regressionFixtures }) {
  const pilotByCase = new Map();
  for (const result of report.results ?? []) {
    const key = `${result.category}::${result.repetition}`;
    const values = pilotByCase.get(key) ?? [];
    values.push(result);
    pilotByCase.set(key, values);
  }
  const rows = [];
  const summary = new Map();
  for (const category of pilotFixtures.categories ?? []) {
    const replacement = (regressionFixtures.categories ?? []).find((item) => item.id === category.id);
    const requirements = replacement?.requirements ?? [];
    const grounding = replacement?.taskClass === "under-specified" || requirements.some((item) => item.kind === "groundedness")
      ? "clarification-required"
      : "fact-sufficient";
    const hardRequirements = requirements.map((item) => item.id ?? item.kind).filter(Boolean).join(", ") || "none";
    const protectedContent = requirements
      .filter((item) => item.protected === true)
      .flatMap(valuesForRequirement)
      .filter((value) => value !== undefined)
      .join(", ") || "none";
    const policy = replacement?.compressionPolicy;
    const compressionPolicy = policy?.eligible === false
      ? "exempt"
      : `eligible (target ${policy?.targetRatio ?? "default"})`;
    for (let repetition = 0; repetition < 3; repetition += 1) {
      const key = `${category.id}::${repetition}`;
      const issue = pilotIssue(pilotByCase.get(key) ?? [], {
        underSpecified: grounding === "clarification-required",
        exempt: policy?.eligible === false,
      });
      const disposition = "Revised fixture and requirements";
      summary.set(disposition, (summary.get(disposition) ?? 0) + 1);
      rows.push(`| \`${category.id}-r${repetition + 1}\` | ${cell(replacement?.taskClass ?? category.taskClass ?? "unclassified")} | ${grounding} | ${cell(hardRequirements)} | ${cell(protectedContent)} | ${cell(compressionPolicy)} | ${cell(issue)} | ${disposition} |`);
    }
  }
  const summaryRows = [...summary.entries()].map(([disposition, count]) => `| ${disposition} | ${count} |`).join("\n");
  return `# Pilot-v1 Benchmark Audit

Source: immutable pilot-v1 results and fixtures. Replacement metadata comes only from regression-v2 requirements[].

| Case ID | Task class | Grounding status | Hard requirements | Protected content | Compression policy | Pilot-v1 issue | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Disposition Summary

| Disposition | Rows |
| --- | ---: |
${summaryRows}
`;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const root = path.resolve(path.dirname(currentFile), "..", "..");
  const reportPath = process.argv[2] ?? path.join(root, "evaluation", "results", "codex-pilot.json");
  const outputPath = process.argv[3] ?? path.join(root, "evaluation", "results", "pilot-v1-benchmark-audit.md");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const pilotFixtures = JSON.parse(fs.readFileSync(path.join(root, "scripts", "evaluation-fixtures.json"), "utf8"));
  const regressionFixtures = JSON.parse(fs.readFileSync(path.join(root, "scripts", "evaluation-fixtures-regression-v2.json"), "utf8"));
  fs.writeFileSync(outputPath, buildBenchmarkAudit({ report, pilotFixtures, regressionFixtures }));
}
