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
    expect(promptContract.commonRules).toContain("Obey constraints.");
    expect(promptContract.commonRules).toContain(
      "Copy required wording exactly. Preserve negation, warnings, identifiers, paths, values, and step order.",
    );
    expect(promptContract.commonRules).toContain(
      "Keep code, commands, tool arguments, files, persisted artifacts, commits, PRs, and docs usable and complete.",
    );
    expect(promptContract.commonRules).toContain(
      "Artifacts: requested fields from supplied facts. No other text. Mark unknowns.",
    );
    expect(promptContract.commonRules).toContain(
      "For confirmation requests, ask \"Do you approve [action] [exact target]?\" Then wait.",
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

  it("uses exact v9 injection lengths and hashes with off at zero", () => {
    expect(promptContract.version).toBe(9);
    expect(computeInjection("off")).toEqual({ mode: "off", text: "", sourceHash: "" });
    const canonicalContractHash = createHash("sha256")
      .update(JSON.stringify(promptContract))
      .digest("hex");
    expect(canonicalContractHash).toBe(
      "d29ec347edbba3a102e7fed1e28d5b90b7fce63758bb04892a933ede06a9f01c",
    );
    const expected = {
      lite: { length: 457, hash: "c652776308987512" },
      full: { length: 441, hash: "c8d28a3fe45b4bba" },
      ultra: { length: 476, hash: "c2f2b0a7397a07b8" },
      "wenyan-lite": { length: 507, hash: "903c00668e8aa16d" },
      wenyan: { length: 501, hash: "eda7c92dd8898e12" },
      "wenyan-ultra": { length: 511, hash: "2d83c34535b311b9" },
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

  it("uses the exact v9 mode rules", () => {
    expect(promptContract.modeRules.lite).toBe("Use concise complete prose.");
    expect(promptContract.modeRules.full).toBe("Be concise.");
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
      expect(text, `mode=${mode}`).toContain("Obey constraints");
    }
  });

  it("keeps document and persisted-content rules in every active mode", () => {
    for (const mode of VALID_MODES.filter((item) => item !== "off")) {
      const text = computeInjection(mode).text;
      expect(text, `mode=${mode}`).toContain("files, persisted artifacts, commits, PRs, and docs usable and complete");
      expect(text, `mode=${mode}`).toContain("usable and complete");
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
