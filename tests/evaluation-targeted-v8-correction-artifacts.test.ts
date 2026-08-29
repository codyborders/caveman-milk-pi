// Committed derived artifacts for the targeted-v8 correction: the JSON and
// Markdown must match a deterministic regeneration exactly, and every
// changed outcome must carry a raw pointer plus a response hash that the
// paid source bytes verify. Red initial failure: neither artifact existed
// (readFileSync exited 1 with ENOENT for the derived JSON).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTargetedV8Correction,
  renderTargetedV8CorrectionMarkdown,
} from "../scripts/eval/targeted-v8-correction.mjs";

const root = path.resolve(import.meta.dirname, "..");

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("targeted-v8 derived artifacts", () => {
  it("commits deterministic derived JSON and Markdown with auditable changed outcomes", () => {
    const correction = buildTargetedV8Correction();
    const source = JSON.parse(
      readFileSync(path.join(root, "evaluation/results/benchmark-targeted-v8.json"), "utf8"),
    );
    const derivedJson = readFileSync(
      path.join(root, "evaluation/results/benchmark-targeted-v8-corrected-v1.json"),
      "utf8",
    );
    const derivedMd = readFileSync(
      path.join(root, "evaluation/results/benchmark-targeted-v8-corrected-v1.md"),
      "utf8",
    );

    expect(derivedJson).toBe(`${JSON.stringify(correction, null, 2)}\n`);
    expect(derivedMd).toBe(renderTargetedV8CorrectionMarkdown(correction));
    const parsed = JSON.parse(derivedJson);
    expect(parsed.correction.derived).toBe(true);
    expect(parsed.correction.version).toBe(1);
    expect(parsed.correction.generator).toBe("scripts/eval/targeted-v8-correction.mjs");
    expect(parsed.correction.externalModelCalls).toBe(0);
    expect(parsed.correction.changedOutcomeCount).toBe(4);
    expect(parsed.correction.unchangedOutcomeCount).toBe(116);

    const changed = parsed.correction.changedOutcomes;
    expect(changed.map((entry) => entry.mode).sort()).toEqual(["full", "lite", "off", "off"]);
    expect(changed.every((entry) => entry.category === "commit-pr")).toBe(true);
    for (const entry of changed) {
      expect(entry.pointer).toMatch(/^\/results\/\d+$/);
      const index = Number(entry.pointer.substring("/results/".length));
      const original = source.results[index];
      expect(original.key).toBe(entry.key);
      expect(original.mode).toBe(entry.mode);
      expect(original.repetition).toBe(entry.repetition);
      expect(original.behavioralPassed).toBe(false);
      expect(entry.responseSha256).toBe(sha256Text(original.response));
      expect(entry.originalValidation.passed).toBe(false);
      expect(entry.originalValidation.failedChecks.length).toBeGreaterThan(0);
      expect(entry.recomputedValidation.passed).toBe(true);
      expect(entry.recomputedValidation.failedChecks).toEqual([]);
      expect(entry.corrections).toContain(
        "soft-wrapped-commit-pr-prose-joined-before-supplied-facts",
      );
    }

    expect(derivedMd).toContain(
      "df96aad18cccb62eeb5bc8f70c93c464f090bad76deabc08ed4b9ca96e05069b",
    );
    expect(derivedMd).toContain("40/40");
    expect(derivedMd).toContain("37/40");
    expect(derivedMd).toContain("/results/");
    expect(derivedMd).toContain("soft-wrapped");
    expect(derivedMd).toContain("affects no targeted-v8 outcome");
  });
});
