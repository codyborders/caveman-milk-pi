// Preflight guard: schema-4 paragraph-count requirement shapes must reject
// before plan construction and before any paid provider traffic.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { runRequirements } from "../scripts/eval/validators.mjs";

function schema4FixturesWith(mutatedCategory) {
  const fixtures = evaluate.loadFixtures("benchmark-regression-v2");
  return {
    ...fixtures,
    categories: fixtures.categories.map((category) =>
      category.id === "file-writing" ? mutatedCategory(category) : category,
    ),
  };
}

function preflightOptions(fixtures, fetchImpl) {
  return {
    apiKey: "test-key",
    model: "test-model",
    allowPaid: true,
    endpoint: "http://preflight.invalid/v1/messages",
    fetchImpl,
    fixtures,
    modes: ["off", "full"],
    categories: ["file-writing"],
    repetitions: 3,
    seed: "0xa1b2c3d4",
    execGit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    readPiVersion: () => "0.84.3",
    sleepImpl: async () => {},
  };
}

function spyFetch() {
  let providerCalls = 0;
  const fetchImpl = async () => {
    providerCalls += 1;
    throw new Error("provider execution must not happen during preflight rejection");
  };
  return { fetchImpl, providerCalls: () => providerCalls };
}

describe("schema-4 paragraph-count preflight", () => {
  it("rejects duplicate paragraph-count requirements before any provider execution", async () => {
    const { fetchImpl, providerCalls } = spyFetch();
    const fixtures = schema4FixturesWith((category) => ({
      ...category,
      requirements: [
        ...category.requirements,
        { id: "paragraphs-2", kind: "paragraph-count", count: 2, hardGroup: "contract", protected: false },
      ],
    }));

    await expect(
      evaluate.runProviderEvaluation(preflightOptions(fixtures, fetchImpl)),
    ).rejects.toThrow(/file-writing/);
    expect(providerCalls()).toBe(0);
  });

  it("rejects a non-Boolean paragraph-count includeHeadings before any provider execution", async () => {
    const { fetchImpl, providerCalls } = spyFetch();
    const fixtures = schema4FixturesWith((category) => ({
      ...category,
      requirements: category.requirements.map((requirement) =>
        requirement.kind === "paragraph-count"
          ? { ...requirement, includeHeadings: "no" }
          : requirement,
      ),
    }));

    await expect(
      evaluate.runProviderEvaluation(preflightOptions(fixtures, fetchImpl)),
    ).rejects.toThrow(/file-writing/);
    expect(providerCalls()).toBe(0);
  });

  it.each(["benchmark-regression-v2", "fresh-v1"])(
    "keeps zero-or-one paragraph-count categories valid for %s",
    (fixtureSet) => {
      const fixtures = evaluate.loadFixtures(fixtureSet);
      // technical-explanation declares zero paragraph-count requirements and
      // file-writing declares exactly one with a Boolean includeHeadings.
      const paragraphCounts = fixtures.categories.map(
        (category) =>
          category.requirements.filter((requirement) => requirement.kind === "paragraph-count").length,
      );
      expect(Math.max(...paragraphCounts)).toBeLessThanOrEqual(1);
      expect(() => evaluate.validateSelectedCategories(fixtures.categories)).not.toThrow();
    },
  );
});

describe("runRequirements paragraph-count mirror", () => {
  it("rejects duplicate paragraph-count requirements for direct callers", () => {
    expect(() =>
      runRequirements(
        "# Installation\n\nInstall the package from the registry.",
        [
          { id: "paragraphs", kind: "paragraph-count", count: 1, includeHeadings: false, hardGroup: "contract", protected: true },
          { id: "paragraphs-2", kind: "paragraph-count", count: 2, hardGroup: "contract", protected: false },
        ],
        { toolCall: null, expectsTool: false },
      ),
    ).toThrow(/paragraph-count/);
  });

  it("rejects a supplied non-Boolean paragraph-count includeHeadings for direct callers", () => {
    expect(() =>
      runRequirements(
        "# Installation\n\nInstall the package from the registry.",
        [
          { id: "paragraphs", kind: "paragraph-count", count: 2, includeHeadings: "no", hardGroup: "contract", protected: true },
        ],
        { toolCall: null, expectsTool: false },
      ),
    ).toThrow(/includeHeadings/);
  });
});
