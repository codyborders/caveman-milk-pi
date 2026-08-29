// Targeted-v4 fixture identity and task-boundary contract tests.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashFixtureContent, loadFixtures } from "../scripts/evaluate.mjs";

const fixturePath = "scripts/evaluation-fixtures-targeted-v4.json";
const fixtureSha256 = "c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de";

describe("benchmark-targeted-v4 fixture contract", () => {
  it("pins identity and removes avoidable task ambiguity", () => {
    const source = readFileSync(fixturePath, "utf8");
    const document = JSON.parse(source);
    const loaded = loadFixtures("benchmark-targeted-v4");

    expect(hashFixtureContent(source)).toBe(fixtureSha256);
    expect(loaded.fixtureHash).toBe(fixtureSha256);
    expect(document.fixtureSet).toBe("benchmark-targeted-v4");
    expect(document.modes).toEqual(["off", "lite", "full"]);
    expect(document.categories.map((category: { id: string }) => category.id)).toEqual([
      "negation",
      "irreversible-confirmation",
      "commit-pr",
      "clarification",
    ]);

    const negation = document.categories[0];
    expect(negation.prompt).toContain("without reading files or using tools");
    expect(negation.prompt).toContain("Do not delete backups.");

    const confirmation = document.categories[1];
    expect(confirmation.prompt).toContain("question itself must contain /var/lib/caveman/cache");
    expect(confirmation.requirements[0].target).toBe("/var/lib/caveman/cache");

    const commitPr = document.categories[2];
    expect(commitPr.prompt).toContain("Return exactly two artifacts");
    expect(commitPr.prompt).toContain("Do not add a PR title, notes, testing section");
    expect(commitPr.requirements).toContainEqual(
      expect.objectContaining({ id: "supplied-facts", hardGroup: "groundedness" }),
    );

    const clarification = document.categories[3];
    expect(clarification.prompt).toContain("before deployment");
    expect(clarification.prompt).toContain("Do not invent rollback steps");
  });
});
