// Compact prompt generation for caveman-milk-pi.
//
// Runtime text depends only on the selected mode and committed constants.
// The vendored skill remains available for provenance review, but it does not
// determine bytes appended to Pi's system prompt.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CavemanMode, InjectionCache } from "./types.js";

type ActiveMode = Exclude<CavemanMode, "off">;

const COMMON_RULES =
  "Answer concisely in the user’s language. Remove filler and repetition. " +
  "Apply this style to every chat response until the user disables caveman. " +
  "Use clear complete prose for security warnings, irreversible confirmations, ordered safety steps, and clarification. " +
  "Preserve negation, exact values, technical terms, warnings, and step order. " +
  "Use normal prose in files, code comments, commits, PRs, messages, and tool arguments. " +
  "Use full prose for explicitly requested documents or tutorials. " +
  "Do not invent abbreviations or use symbols merely to appear terse. ";

const MODE_RULES: Readonly<Record<ActiveMode, string>> = {
  lite: "Use concise complete sentences with normal grammar.",
  full: "Use concise sentences or clear fragments when unambiguous.",
  ultra: "Use the fewest clear words. State each fact once. Keep grammar when breaking it saves nothing.",
  "wenyan-lite":
    "For Chinese input, use light literary Chinese with complete grammar. Keep other input languages unchanged.",
  wenyan:
    "For Chinese input, use literary Chinese while preserving meaning and technical terms. Keep other input languages unchanged.",
  "wenyan-ultra":
    "For Chinese input, use the shortest clear literary Chinese. Preserve meaning and technical terms. Keep other input languages unchanged.",
};

function getSkillPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "skill", "SKILL.md");
}

export function loadSkillContent(): string {
  const skillPath = getSkillPath();
  if (!fs.existsSync(skillPath)) {
    throw new Error(
      `caveman-milk-pi could not load SKILL.md at ${skillPath}. ` +
        "Reinstall the extension or verify skill/SKILL.md exists.",
    );
  }

  const content = fs.readFileSync(skillPath, "utf8");
  if (content.length === 0) {
    throw new Error(
      `caveman-milk-pi SKILL.md at ${skillPath} is empty. Restore via scripts/sync-skill.sh.`,
    );
  }
  if (!content.includes("## Intensity")) {
    throw new Error(
      `caveman-milk-pi SKILL.md at ${skillPath} is malformed (no "## Intensity" section). ` +
        "Restore via scripts/sync-skill.sh.",
    );
  }
  return content;
}

function canonicalModeLabel(mode: ActiveMode): string {
  return mode === "wenyan" ? "wenyan-full" : mode;
}

export function computeInjection(mode: CavemanMode): InjectionCache {
  if (mode === "off") {
    return { mode, text: "", sourceHash: "" };
  }

  const activeLabel = canonicalModeLabel(mode);
  const text =
    `\n\nCAVEMAN MODE ACTIVE — level: ${activeLabel}\n` +
    COMMON_RULES +
    MODE_RULES[mode];
  const sourceHash = crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .substring(0, 16);

  return { mode, text, sourceHash };
}
