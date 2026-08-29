// Covers the benchmark-targeted-v3 fixture contract: the four targeted
// categories, the targeted confirmation and commit/PR requirements, and the
// frozen manifest hash.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const frozenSha256 = "4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004";

describe("benchmark-targeted-v3 fixture contract", () => {
  it("loads benchmark-targeted-v3 with the targeted categories and frozen hash", () => {
    const fixtures = evaluate.loadFixtures("benchmark-targeted-v3");
    expect(fixtures.fixtureSet).toBe("benchmark-targeted-v3");
    expect(fixtures.version).toBe(3);
    expect(fixtures.fixtureHash).toBe(frozenSha256);
    expect(fixtures.modes).toEqual(["off", "lite", "full"]);
    expect(fixtures.categories.map((category) => category.id)).toEqual([
      "negation",
      "irreversible-confirmation",
      "commit-pr",
      "clarification",
    ]);
    const confirmation = fixtures.categories.find(
      (category) => category.id === "irreversible-confirmation",
    );
    expect(confirmation?.prompt).toContain("/var/lib/caveman/cache");
    expect(confirmation?.prompt).toContain("actual approval request");
    expect(confirmation?.prompt).toContain("yes/no or confirm/cancel question");
    expect(confirmation?.prompt).toContain("Do not promise to ask later");
    expect(confirmation?.requirements).toContainEqual(
      expect.objectContaining({
        kind: "confirmation",
        phrase: "cannot be undone",
        target: "/var/lib/caveman/cache",
        hardGroup: "safety",
        protected: true,
      }),
    );
    const commitPr = fixtures.categories.find((category) => category.id === "commit-pr");
    expect(commitPr?.prompt).toContain("config.json");
    expect(commitPr?.prompt).toContain("settings.json");
    expect(commitPr?.prompt).toContain("unknown keys remain");
    expect(commitPr?.prompt).toContain("atomic");
    expect(commitPr?.prompt).toContain("Do not claim tests or implementation details");
    expect(commitPr?.prompt).toContain("exact term Config migration");
    expect(commitPr?.requirements).toContainEqual(
      expect.objectContaining({ kind: "persisted-prose", artifactType: "commit-pr" }),
    );
    expect(commitPr?.requirements).toContainEqual(
      expect.objectContaining({ kind: "exact-term", value: "Config migration" }),
    );
    expect(commitPr?.requirements).toContainEqual(
      expect.objectContaining({
        id: "supplied-facts",
        kind: "supplied-facts",
        allowedFacts: [
          "legacy config.json migrates to settings.json",
          "unknown keys remain",
          "writes are atomic",
        ],
        hardGroup: "groundedness",
      }),
    );
    const manifest = JSON.parse(readFileSync("evaluation/fixture-manifest.json", "utf8"));
    const normalized = readFileSync("scripts/evaluation-fixtures-targeted-v3.json", "utf8")
      .replaceAll("\r\n", "\n");
    const hash = createHash("sha256").update(normalized).digest("hex");
    expect(manifest.fixtureSets["benchmark-targeted-v3"]?.sha256).toBe(hash);
    expect(() => evaluate.validateSelectedCategories(fixtures.categories)).not.toThrow();
  });
});
