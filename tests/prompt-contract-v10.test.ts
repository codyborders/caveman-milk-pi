// Prompt contract v10 experiment: only the active common rules change, every
// active mode must inject at least 25 percent fewer estimated tokens than the
// preserved v9 baseline, and the baseline text and hash stay locked in the
// versioned experiment record.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import promptContract from "../src/prompt-contract.json" with { type: "json" };
import { computeInjection } from "../src/injection.js";
import { VALID_MODES } from "../src/types.js";

const root = path.resolve(import.meta.dirname, "..");
const experimentPath = path.join(root, "evaluation", "prompt-experiment-v10.json");
const ACTIVE_MODES = VALID_MODES.filter((mode) => mode !== "off");
const estimateTokens = (text: string) => Math.round(text.length / 4);

describe("prompt experiment v10 baseline record", () => {
  it("preserves the complete v9 contract text and its canonical hash", () => {
    const experiment = JSON.parse(readFileSync(experimentPath, "utf8"));
    expect(experiment.version).toBe(1);
    expect(experiment.experiment).toBe("lite-v10");
    const baseline = experiment.baseline;
    expect(baseline.contract.version).toBe(9);
    expect(baseline.contract.commonRules).toContain("Obey constraints.");
    expect(baseline.contract.commonRules.endsWith(" ")).toBe(true);
    expect(baseline.contractSha256).toBe(
      "3611fa174ef844d6323a1e1f28428c78d00316588607d6f0b68df62e58734d49",
    );
    const recomputed = createHash("sha256")
      .update(JSON.stringify(baseline.contract))
      .digest("hex");
    expect(recomputed).toBe(baseline.contractSha256);
    expect(baseline.injected.lite).toEqual({
      characters: 453,
      estimatedTokens: 113,
      sourceHash: "8a9105956e558a0c",
    });
  });
});

describe("prompt contract v10", () => {
  it("cuts fully injected estimated tokens by at least the predeclared 25 percent on every active mode", () => {
    const experiment = JSON.parse(readFileSync(experimentPath, "utf8"));
    const target = experiment.target;
    expect(target.minimumFullyInjectedTokenReduction).toBe(0.25);
    expect(target.measurement).toContain("Math.round(characters / 4)");
    expect(promptContract.version).toBe(10);
    expect(computeInjection("off").text).toBe("");
    for (const mode of ACTIVE_MODES) {
      const v9Tokens = estimateTokens(experiment.baseline.runtimePrompts[mode]);
      const v10Tokens = estimateTokens(computeInjection(mode).text);
      const reduction = (v9Tokens - v10Tokens) / v9Tokens;
      expect(reduction, `mode=${mode} v9=${v9Tokens} v10=${v10Tokens}`).toBeGreaterThanOrEqual(
        target.minimumFullyInjectedTokenReduction,
      );
    }
  });
});
