// Injection tests cover the vendored artifact and deterministic compact prompt generation.

import { describe, expect, it } from "vitest";
import { validateMode } from "../src/config.js";
import { computeInjection, loadSkillContent } from "../src/injection.js";
import promptContract from "../src/prompt-contract.json" with { type: "json" };
import { VALID_MODES } from "../src/types.js";

describe("loadSkillContent", () => {
  it("loads the vendored SKILL.md", () => {
    const content = loadSkillContent();
    expect(content.length).toBeGreaterThan(1000);
    expect(content).toContain("## Intensity");
    expect(content).toContain("## Boundaries");
  });
});

describe("computeInjection determinism", () => {
  for (const mode of VALID_MODES) {
    it(`mode=${mode}: repeated calls return identical output`, () => {
      const first = computeInjection(mode);
      const second = computeInjection(mode);
      expect(first.text).toBe(second.text);
      expect(first.sourceHash).toBe(second.sourceHash);
    });
  }

  it("keeps one hash across repeated calls", () => {
    const hashes = new Set<string>();
    for (let index = 0; index < 10; index++) {
      hashes.add(computeInjection("full").sourceHash);
    }
    expect(hashes.size).toBe(1);
  });
});

describe("computeInjection compact rules", () => {
  it("off mode produces empty text", () => {
    const result = computeInjection("off");
    expect(result.text).toBe("");
    expect(result.sourceHash).toBe("");
  });

  it("keeps every active mode below 800 characters", () => {
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      expect(computeInjection(mode).text.length, `mode=${mode}`).toBeLessThanOrEqual(800);
    }
  });

  it("full mode uses exact compact runtime rules", () => {
    const result = computeInjection("full");
    expect(result.text).toBe(
      "\n\nCAVEMAN MODE ACTIVE — level: full\n" +
        promptContract.commonRules +
        promptContract.modeRules.full,
    );
    expect(result.text).not.toContain("## Intensity");
    expect(result.text).not.toContain("| **full** |");
  });

  it("uses distinct intensity rules", () => {
    expect(computeInjection("lite").text).toContain("concise complete sentences");
    expect(computeInjection("full").text).toContain("clear fragments");
    expect(computeInjection("ultra").text).toContain("fewest clear words");
  });

  it("uses literary Chinese rules only for Chinese input", () => {
    for (const mode of ["wenyan-lite", "wenyan", "wenyan-ultra"] as const) {
      const text = computeInjection(mode).text;
      expect(text, `mode=${mode}`).toContain("For Chinese input");
      expect(text, `mode=${mode}`).toContain("For non-Chinese input, preserve original language");
      expect(text, `mode=${mode}`).toContain("Keep style in assistant chat responses until disabled");
    }
  });

  it("keeps document and persisted-content rules in every active mode", () => {
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      const text = computeInjection(mode).text;
      expect(text, `mode=${mode}`).toContain("Normal prose for files");
      expect(text, `mode=${mode}`).toContain("full prose for explicitly requested documents");
    }
  });

  it("uses the canonical wenyan-full header", () => {
    expect(computeInjection("wenyan").text).toContain(
      "CAVEMAN MODE ACTIVE — level: wenyan-full",
    );
  });
});

describe("validateMode", () => {
  it("accepts all valid modes", () => {
    for (const mode of VALID_MODES) {
      expect(validateMode(mode)).toBe(mode);
    }
  });

  it("throws on an unknown mode and lists valid modes", () => {
    expect(() => validateMode("turbo")).toThrow(/invalid mode 'turbo'/);
    expect(() => validateMode("turbo")).toThrow(/off, lite, full, ultra/);
  });

  it("throws on non-string input", () => {
    expect(() => validateMode(42)).toThrow(/mode must be a string/);
  });
});
