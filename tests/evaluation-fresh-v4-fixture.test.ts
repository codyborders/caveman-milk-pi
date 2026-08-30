import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadFixtures } from "../scripts/evaluate.mjs";
describe("fresh-v4 frozen holdout", () => {
  it("locks fixture and result bytes against platform conversion", () => {
    const attributes = fs.readFileSync(path.resolve(import.meta.dirname, "..", ".gitattributes"), "utf8");
    for (const file of [
      "scripts/evaluation-fixtures-fresh-v4.json",
      "evaluation/results/fresh-v4-preflight.json",
      "evaluation/results/fresh-v4-cold-controlled-v1.json",
      "evaluation/results/fresh-v4-warmup-shared-v1.json",
      "evaluation/results/fresh-v4-warm-controlled-v1.json",
      "evaluation/results/fresh-v4-analysis-v1.json",
      "evaluation/results/fresh-v4-analysis-v1.md",
    ]) {
      expect(attributes).toContain(`${file} -text`);
    }
  });

  it("contains five direct and three executable nested categories", () => {
    const fixtures = loadFixtures("fresh-v4");
    expect(fixtures.fixtureSet).toBe("fresh-v4");
    expect(fixtures.categories.filter((category) => category.nested !== true)).toHaveLength(5);
    const nested = fixtures.categories.filter((category) => category.nested === true);
    expect(nested).toHaveLength(3);
    for (const category of nested) {
      expect(Object.keys(category.workspace?.files ?? {}), category.id).not.toHaveLength(0);
      const delegation = category.requirements.find(
        (requirement) => requirement.kind === "nested-delegation",
      );
      expect(delegation?.requiredTerms.length, category.id).toBeGreaterThan(1);
      expect(delegation?.requiredChildResponseTerms?.length, category.id).toBeGreaterThan(1);
    }
  });

  it("covers selective-response protections without fresh-v3 identifiers", () => {
    const fixtures = loadFixtures("fresh-v4");
    const coverage = new Set(fixtures.categories.flatMap((category) => category.coverage));
    for (const required of [
      "safety-warning",
      "irreversible-confirmation",
      "uncertainty",
      "negation",
      "scope",
      "paths",
      "commands",
      "exact-values",
      "ordered-steps",
      "unfinished-work",
      "nested-handoff",
      "persisted-artifact",
    ]) {
      expect(coverage.has(required), required).toBe(true);
    }
    const serialized = JSON.stringify(fixtures);
    for (const oldTerm of [
      "parseDelay",
      "TIMEOUT_MS",
      "deploy/canary.yaml",
      "metrics-cli",
      "QUEUE_RETRY_LIMIT",
      "token-filter",
    ]) {
      expect(serialized).not.toContain(oldTerm);
    }
  });
});
