// Injection tests cover the vendored artifact and deterministic compact prompt generation.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  it("keeps constraint, protection, fact, and approval rules", () => {
    expect(promptContract.commonRules).toContain("Answer directly within constraints.");
    expect(promptContract.commonRules).toContain(
      "Preserve exact phrases, negation, warnings, identifiers, paths, values, ordered steps, code, commands, and tool arguments.",
    );
    expect(promptContract.commonRules).toContain(
      "Keep files, persisted artifacts, commits, PRs, and docs complete and usable.",
    );
    expect(promptContract.commonRules).toContain(
      "Artifacts use supplied facts only. Add no notes or commentary. State unknowns.",
    );
    expect(promptContract.commonRules).toContain(
      "For confirmation ask: \"Do you approve [action] [exact target]?\" Then wait.",
    );
  });

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

  it("uses exact v7 injection lengths and hashes with off at zero", () => {
    expect(promptContract.version).toBe(7);
    expect(computeInjection("off")).toEqual({ mode: "off", text: "", sourceHash: "" });
    const canonicalContractHash = createHash("sha256")
      .update(JSON.stringify(promptContract))
      .digest("hex");
    expect(canonicalContractHash).toBe(
      "01fc92b7cc2648cd1795fbc3dfeb0d7f82afdea39e0969ded8552d3f0aeb87be",
    );
    const expected = {
      lite: { length: 453, hash: "3783d1c8cf5bf39a" },
      full: { length: 444, hash: "12dbbc0d838fa95e" },
      ultra: { length: 472, hash: "2c8752d5c1c6cd84" },
      "wenyan-lite": { length: 503, hash: "7c435e3d0fe995d2" },
      wenyan: { length: 497, hash: "8290e7450ea71558" },
      "wenyan-ultra": { length: 507, hash: "21d2b192c4a8d27e" },
    } as const;
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      const injection = computeInjection(mode);
      expect(injection.text.length, `mode=${mode}`).toBe(expected[mode].length);
      expect(injection.sourceHash, `mode=${mode}`).toBe(expected[mode].hash);
      expect(injection.text.length, `mode=${mode}`).toBeLessThanOrEqual(800);
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

  it("uses the exact v7 mode rules", () => {
    expect(promptContract.modeRules.lite).toBe("Use concise complete prose.");
    expect(promptContract.modeRules.full).toBe("Use concise prose.");
    expect(promptContract.modeRules.ultra).toBe("Use fewest clear words. State each fact once.");
    expect(promptContract.modeRules["wenyan-lite"]).toBe(
      "Chinese: light literary style. Other languages: concise and unchanged.",
    );
    expect(promptContract.modeRules.wenyan).toBe(
      "Chinese: literary style. Other languages: concise and unchanged.",
    );
    expect(promptContract.modeRules["wenyan-ultra"]).toBe(
      "Chinese: shortest literary style. Other languages: concise and unchanged.",
    );
  });

  it("uses literary Chinese rules only for Chinese input", () => {
    for (const mode of ["wenyan-lite", "wenyan", "wenyan-ultra"] as const) {
      const text = computeInjection(mode).text;
      expect(text, `mode=${mode}`).toContain("Chinese:");
      expect(text, `mode=${mode}`).toContain("Other languages: concise and unchanged.");
      expect(text, `mode=${mode}`).toContain("within constraints");
    }
  });

  it("keeps document and persisted-content rules in every active mode", () => {
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      const text = computeInjection(mode).text;
      expect(text, `mode=${mode}`).toContain("Keep files, persisted artifacts, commits, PRs, and docs complete");
      expect(text, `mode=${mode}`).toContain("complete and usable");
    }
  });

  it("uses the canonical wenyan-full header", () => {
    expect(computeInjection("wenyan").text).toContain(
      "CAVEMAN MODE ACTIVE — level: wenyan-full",
    );
  });

  it("keeps README prompt lengths synchronized with generated injections", () => {
    const readme = readFileSync("README.md", "utf8");
    const currentLengths = new Map<string, { characters: number; estimatedTokens: number }>();
    for (const match of readme.matchAll(/^\| `([^`]+)` \| [\d,]+ \| ([\d,]+) \| [\d,]+ \| ([\d,]+) \|$/gm)) {
      currentLengths.set(String(match[1]), {
        characters: Number(String(match[2]).replaceAll(",", "")),
        estimatedTokens: Number(String(match[3]).replaceAll(",", "")),
      });
    }
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      const characters = computeInjection(mode).text.length;
      expect(currentLengths.get(mode), `mode=${mode}`).toEqual({
        characters,
        estimatedTokens: Math.round(characters / 4),
      });
    }
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
