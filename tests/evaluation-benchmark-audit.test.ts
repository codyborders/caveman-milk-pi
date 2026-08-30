// Covers deterministic audit generation for all 45 pilot-v1 cases.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBenchmarkAudit } from "../scripts/eval/benchmark-audit.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("pilot-v1 benchmark audit", () => {
  it("reports every repeated case and its replacement disposition", () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "evaluation/results/codex-pilot.json"), "utf8"),
    );
    const pilotFixtures = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "scripts/evaluation-fixtures.json"), "utf8"),
    );
    const regressionFixtures = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "scripts/evaluation-fixtures-regression-v2.json"), "utf8"),
    );

    const markdown = buildBenchmarkAudit({ report, pilotFixtures, regressionFixtures });
    const caseRows = markdown.split("\n").filter((line) => /^\| `[^`]+-r[1-3]` \|/.test(line));

    expect(caseRows).toHaveLength(45);
    expect(markdown).toContain("| Case ID | Task class | Grounding status | Hard requirements | Protected content | Compression policy | Pilot-v1 issue | Disposition |");
    expect(markdown).toContain("`comparison-r1`");
    expect(markdown).toContain("clarification-required");
    expect(markdown).toContain("Prompt lacked facts. Old judging rewarded unsupported specificity");
    expect(markdown).toContain("Universal compression gate conflicted with the prompt exemption");
    expect(markdown).toContain("Revised fixture and requirements");
    expect(markdown).toContain("## Disposition Summary");
    expect(markdown).not.toContain(repositoryRoot);
  });
});
