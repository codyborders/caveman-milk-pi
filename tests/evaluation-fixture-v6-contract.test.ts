// Fresh-v3 fixture contract: direct plus nested categories, off-versus-lite
// scope only, mandated coverage, real nested workspace tasks, and a committed
// manifest entry locking the fixture bytes by SHA-256.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(root, "scripts", "evaluation-fixtures-fresh-v3.json");

describe("fresh-v3 fixture contract", () => {
  it("locks direct and nested categories with mandated coverage behind a committed manifest hash", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.fixtureSet).toBe("fresh-v3");
    expect(fixture.version).toBe(6);
    expect(fixture.modes).toEqual(["off", "lite"]);
    expect(fixture.categories.length).toBeGreaterThanOrEqual(7);

    const forbiddenKinds = new Set(["persisted-prose", "paragraph-count"]);
    for (const category of fixture.categories) {
      expect(category.requirements.some((item) => item.kind === "protected-facts")).toBe(true);
      expect(category.requirements.some((item) => forbiddenKinds.has(item.kind))).toBe(false);
      expect(category.compressionPolicy.eligible).toBe(false);
    }

    const coverage = new Set(fixture.categories.flatMap((category) => category.coverage ?? []));
    for (const name of [
      "safety-warning",
      "uncertainty",
      "exact-values",
      "paths",
      "commands",
      "ordered-plan",
      "known-gap",
      "unfinished-work",
      "complete-artifact",
      "nested-delegation",
      "parent-to-child",
      "child-to-parent",
      "multi-turn-coding",
    ]) {
      expect(coverage.has(name), `missing coverage ${name}`).toBe(true);
    }

    const nested = fixture.categories.filter((category) => category.nested === true);
    expect(nested.length).toBe(3);
    expect(nested).toContainEqual(expect.objectContaining({
      requirements: expect.arrayContaining([
        expect.objectContaining({
          kind: "nested-delegation",
          requiredChildResponseTerms: expect.arrayContaining([
            "SECURITY WARNING",
            "Confidence is low because the load test has not run.",
            "Load testing remains unfinished.",
            "kubectl apply -f deploy/canary.yaml --namespace canary",
          ]),
        }),
      ]),
    }));
    const direct = fixture.categories.filter((category) => category.nested !== true);
    expect(direct.length).toBeGreaterThanOrEqual(5);
    for (const category of nested) {
      expect(Object.keys(category.workspace.files).length).toBeGreaterThanOrEqual(2);
      expect(category.requirements).toContainEqual(
        expect.objectContaining({
          kind: "nested-delegation",
          toolName: "delegate_eval_child",
          protected: true,
        }),
      );
      expect(category.requirements).toContainEqual(
        expect.objectContaining({
          kind: "workspace-discipline",
          requireTests: true,
          requirePassingTests: true,
        }),
      );
    }

    const manifest = JSON.parse(
      readFileSync(path.join(root, "evaluation", "fixture-manifest.json"), "utf8"),
    );
    const bytes = readFileSync(fixturePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(manifest.fixtureSets["fresh-v3"]).toEqual({
      path: "scripts/evaluation-fixtures-fresh-v3.json",
      sha256,
      role: "locked-nested-off-lite-set",
    });
    expect(sha256).toBe(
      "df12469c154635f1c00cebb6490e6fcacbd78dfcae584eb5c10b27ddf13c37d3",
    );
  });
});
