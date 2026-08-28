// Covers complete structured contracts for regression-v2 and fresh-v1 fixture sets.
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const hardGroups = new Set(["correctness", "groundedness", "contract", "safety"]);

describe("schema 4 fixture contracts", () => {
  it.each(["benchmark-regression-v2", "fresh-v1"])("defines requirements and task-aware compression for %s", (fixtureSet) => {
    const fixtures = evaluate.loadFixtures(fixtureSet);
    expect(new Set(fixtures.categories.map((category) => category.id)).size).toBe(fixtures.categories.length);

    for (const category of fixtures.categories) {
      expect(category.requirements.length, category.id).toBeGreaterThan(0);
      expect(category).not.toHaveProperty("requiredTerms");
      expect(category).not.toHaveProperty("validators");
      expect(category).not.toHaveProperty("hardRequirements");
      expect(category).not.toHaveProperty("protectedContent");
      for (const requirement of category.requirements) {
        expect(requirement.id, category.id).toEqual(expect.any(String));
        expect(requirement.kind, category.id).toEqual(expect.any(String));
        expect(hardGroups.has(requirement.hardGroup), category.id).toBe(true);
        expect(requirement.protected, category.id).toEqual(expect.any(Boolean));
        if (requirement.kind === "exact-term") {
          expect(requirement.caseSensitive, `${category.id}:${requirement.id}`).toEqual(expect.any(Boolean));
        }
        if (requirement.kind === "persisted-prose") {
          expect(requirement.artifactType, `${category.id}:${requirement.id}`).toEqual(expect.any(String));
        }
      }

      expect(category.compressionPolicy?.eligible, category.id).toEqual(expect.any(Boolean));
      if (category.compressionPolicy.eligible) {
        expect(category.compressionPolicy.targetRatio, category.id).toBeGreaterThan(0);
        expect(category.compressionPolicy.targetRatio, category.id).toBeLessThanOrEqual(1);
      } else {
        expect(category.compressionPolicy.reason, category.id).toEqual(expect.any(String));
      }
    }
  });

  it("covers every required fresh benchmark stratum", () => {
    const classes = new Set(evaluate.loadFixtures("fresh-v1").categories.map((category) => category.taskClass));
    expect(classes).toEqual(
      new Set([
        "short-factual",
        "explanation",
        "technical-answer",
        "structured-instructions",
        "safety-sensitive",
        "irreversible-action",
        "long-form-writing",
        "document-artifact",
        "file-output",
        "commit",
        "pr",
        "under-specified",
      ]),
    );
  });
});
