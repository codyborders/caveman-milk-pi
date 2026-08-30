// Compact prompt generation for caveman-milk-pi.
//
// Runtime text depends only on the selected mode and committed constants.
// The vendored skill remains available for provenance review, but it does not
// determine bytes appended to Pi's system prompt.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import promptContract from "./prompt-contract.json" with { type: "json" };
import type { CavemanMode, InjectionCache } from "./types.js";

type ActiveMode = Exclude<CavemanMode, "off">;

const COMMON_RULES = promptContract.commonRules;
const MODE_RULES: Readonly<Record<ActiveMode, string>> = promptContract.modeRules;
const SKILL_RECOVERY = "Reinstall the extension or restore skill/SKILL.md from the package.";

function getSkillPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "skill", "SKILL.md");
}

export function loadSkillContent(): string {
  const skillPath = getSkillPath();
  if (!fs.existsSync(skillPath)) {
    throw new Error(
      `caveman-milk-pi could not load SKILL.md at ${skillPath}. ${SKILL_RECOVERY}`,
    );
  }

  const content = fs.readFileSync(skillPath, "utf8");
  if (content.length === 0) {
    throw new Error(
      `caveman-milk-pi SKILL.md at ${skillPath} is empty. ${SKILL_RECOVERY}`,
    );
  }
  if (!content.includes("## Intensity")) {
    throw new Error(
      `caveman-milk-pi SKILL.md at ${skillPath} is malformed (no "## Intensity" section). ${SKILL_RECOVERY}`,
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
