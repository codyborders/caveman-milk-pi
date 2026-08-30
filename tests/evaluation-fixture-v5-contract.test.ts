// Fresh-v2 fixture contract. Checks complete source facts, protected manifests,
// off-versus-lite scope, required task coverage, and real workspace tasks.

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(root, "scripts", "evaluation-fixtures-fresh-v2.json");

describe("fresh-v2 fixture contract", () => {
  it("contains only off and lite with content-based requirements", () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    expect(fixture.fixtureSet).toBe("fresh-v2");
    expect(fixture.modes).toEqual(["off", "lite"]);
    expect(fixture.categories.length).toBeGreaterThanOrEqual(14);

    const forbiddenKinds = new Set(["persisted-prose", "paragraph-count"]);
    for (const category of fixture.categories) {
      expect(category.requirements.some((item) => item.kind === "protected-facts")).toBe(true);
      expect(category.requirements.some((item) => forbiddenKinds.has(item.kind))).toBe(false);
      expect(category.compressionPolicy.eligible).toBe(false);
    }
  });

  it("covers required artifacts, handoffs, gaps, and two workspace coding tasks", () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const coverage = new Set(fixture.categories.flatMap((category) => category.coverage ?? []));
    for (const name of [
      "safety-warning",
      "exact-confirmation",
      "commit-message",
      "pull-request-description",
      "configuration-file",
      "installation-instructions",
      "structured-status-report",
      "debugging-summary",
      "ordered-plan",
      "exact-values",
      "parent-to-subagent",
      "subagent-to-parent",
      "multi-turn-coding",
    ]) {
      expect(coverage.has(name), `missing coverage ${name}`).toBe(true);
    }

    const coding = fixture.categories.filter((category) => category.coverage?.includes("multi-turn-coding"));
    expect(coding).toHaveLength(2);
    for (const category of coding) {
      expect(Object.keys(category.workspace.files).length).toBeGreaterThanOrEqual(2);
      expect(category.requirements).toContainEqual(
        expect.objectContaining({
          kind: "workspace-discipline",
          requireTests: true,
          requirePassingTests: true,
        }),
      );
    }

    const artifacts = fixture.categories.filter((category) => category.artifactProducing === true);
    expect(artifacts.length).toBeGreaterThanOrEqual(8);
    for (const category of artifacts) {
      expect(category.suppliedFacts).toBeDefined();
      expect(Object.keys(category.suppliedFacts).length).toBeGreaterThan(0);
    }

    const gap = fixture.categories.find((category) => category.id === "v2-known-gap");
    expect(gap.expectedBehavior).toMatch(/mark/i);
  });
});
