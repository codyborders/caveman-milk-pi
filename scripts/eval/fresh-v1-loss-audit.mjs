// Deterministic fresh-v1 judge-loss audit generator.
//
// The fresh-v1 holdout recorded 16 blinded-judge losses where the off arm
// outranked an active arm: eight for lite and eight for full. This module
// rebuilds that loss list from the immutable paid report, quotes the full
// prompt, supplied facts, protected items, and both responses verbatim, and
// attaches one requested classification per loss together with the
// omission/change and downstream effect found in the raw data.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashFixtureContent } from "../evaluate.mjs";

export const FRESH_V1_LOSS_AUDIT_VERSION = 1;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_REPORT_PATH = path.join(ROOT, "evaluation/results/fresh-v1-v9.json");
const SOURCE_FIXTURE_PATH = path.join(ROOT, "scripts/evaluation-fixtures-fresh-v1.json");
const SOURCE_REPORT_SHA256 = "a40d29aa6d4ec9f4dff573caef559ff3f59f8fc5c52ff30f0121e36efab98ac2";
const SOURCE_FIXTURE_SHA256 = "d961c987a01da8fe2280037489cca42e6c1f303fc06e9d570495dffde3818e3e";

const CLASSIFICATIONS = {
  INVALID_FIXTURE: "Invalid fixture caused by missing source facts",
  REQUIRED_INFORMATION_LOSS: "Actual required-information loss",
  OTHER: "Other",
};

// Per-category ground truth about what the fresh-v1 fixtures actually
// supplied. Every artifact-producing category shipped zero source facts.
const SUPPLIED_FACTS = {
  "fresh-short-factual": "Exact answer 4 requested and supplied.",
  "fresh-explanation": "Only the exact phrase stable identifiers; no mechanism facts supplied.",
  "fresh-coding": "Function name formatUser; no surrounding code supplied.",
  "fresh-steps": "Step order inspect, validate, report; no tool facts supplied.",
  "fresh-safety": "Marker SECURITY WARNING and advice do not share; no environment facts supplied.",
  "fresh-irreversible": "Phrase cannot be undone; no target system facts supplied.",
  "fresh-writing": "Topic backups and two-paragraph shape; no technical claims supplied.",
  "fresh-artifact": "Heading Installation only; no product facts supplied.",
  "fresh-file": "Filename config.json and a complete-prose request; no schema, keys, or values supplied.",
  "fresh-commit": "Fields Subject: and Body:; no fix details, diff, or changed files supplied.",
  "fresh-pr": "Headings Summary and Testing; no change or test-run facts supplied.",
  "fresh-underspecified": "No option facts supplied by design.",
};

// Loss identity -> analysis. Keyed `${mode}:${category}:${repetition}`.
const LOSS_ANALYSIS = {
  "full:fresh-writing:1": {
    classification: CLASSIFICATIONS.OTHER,
    omissionOrChange:
      "Active renames the 3-2-1 backup rule as the rule of three, changing an established identifier.",
    downstreamEffect:
      "A reader following the wrong name cannot find the referenced practice, weakening the persisted explanation.",
    notes: "Judge rationale: misnaming a named rule is a technical error, not compression.",
  },
  "full:fresh-writing:2": {
    classification: CLASSIFICATIONS.OTHER,
    omissionOrChange:
      "Active states categorically that same-disk copies are not true backups, an absolute claim.",
    downstreamEffect:
      "The overstated rule could push a reader to discard a same-disk copy that still has partial recovery value.",
    notes: "Judge rationale: technically overstated.",
  },
  "full:fresh-file:2": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active marks every field as a GAP and invents nothing; off invents a full schema no source supplied.",
    downstreamEffect:
      "The fixture gives no schema to be right or wrong about, so the ranking rewards invention over gap honesty.",
    notes: "Prompt supplies no keys or values; the loss is fixture-made.",
  },
  "lite:fresh-commit:2": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active fills Subject and Body with invented fix facts while marking gaps, and adds a local verification claim.",
    downstreamEffect:
      "With no fix facts supplied, any substantive commit message must invent; the judge can only punish the side that admits it.",
    notes:
      "Actual defect also present: the unsupported local verification sentence is a fabrication, but the missing fixture facts cause the loss.",
  },
  "full:fresh-writing:3": {
    classification: CLASSIFICATIONS.OTHER,
    omissionOrChange:
      "Active claims same-disk copies and single sync services offer no protection at all.",
    downstreamEffect:
      "The absolute wording misstates recovery value and could steer real backup choices.",
    notes: "Judge rationale: overstated.",
  },
  "full:fresh-file:3": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active returns GAP-marked placeholder fragments; off invents configuration behavior.",
    downstreamEffect:
      "Both arms miss the unspecified schema, so the score difference is an artifact of which failure mode the judge prefers.",
    notes: "No schema supplied; invalid fixture.",
  },
  "lite:fresh-commit:3": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active returns Subject and Body filled only with GAP placeholders; off invents a complete narrative.",
    downstreamEffect:
      "The missing fix facts force a choice between unusable placeholder text and fabrication.",
    notes: "No fix details supplied; invalid fixture.",
  },
  "lite:fresh-safety:4": {
    classification: CLASSIFICATIONS.REQUIRED_INFORMATION_LOSS,
    omissionOrChange:
      "Active writes Do not share with a capital D, dropping the exact required lowercase phrase do not share.",
    downstreamEffect:
      "The requested exact advice string disappears from the warning, so downstream string checks and audit greps miss it.",
    notes:
      "Actual required-information loss due to the exact lowercase phrase; the response's minimum-word validator failure is incorrect surface validation, not the judge loss cause.",
  },
  "lite:fresh-file:4": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active returns bracketed placeholders that are not valid JSON; off invents a complete config.",
    downstreamEffect:
      "Without supplied schema facts both arms fail the real task, and the usability gap only ranks which failure reads better.",
    notes:
      "Primary classification invalid fixture: missing source facts; actual usability defect also noted: the active draft is not valid JSON.",
  },
  "full:fresh-commit:4": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active leaves Subject and Body as GAP markers; off invents the entire fix story.",
    downstreamEffect:
      "No supplied fix facts exist, so usable output requires invention and the loss tracks the fixture, not the mode.",
    notes: "Invalid fixture caused by missing source facts.",
  },
  "lite:fresh-explanation:5": {
    classification: CLASSIFICATIONS.OTHER,
    omissionOrChange:
      "Active claims invalidation targets exactly one known identifier, ignoring dependent entries.",
    downstreamEffect:
      "The overstatement could lead a reader to under-invalidate caches with dependent keys.",
    notes: "Judge rationale: technical overstatement.",
  },
  "lite:fresh-writing:5": {
    classification: CLASSIFICATIONS.OTHER,
    omissionOrChange:
      "Active treats continuous sync for critical files as a backup-frequency option without its deletion-propagation risk.",
    downstreamEffect:
      "Sync framed as backup omits the main failure mode that separates syncing from backup.",
    notes: "Judge rationale: loose treatment of synchronization as backup.",
  },
  "full:fresh-file:5": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active returns a single GAP placeholder pair; off asks for schema facts and invents values.",
    downstreamEffect:
      "The absent schema again decides the ranking rather than any mode behavior.",
    notes: "No project facts supplied; invalid fixture.",
  },
  "lite:fresh-file:5": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active invents plausible values and labels them placeholders; off invents values inside full prose.",
    downstreamEffect:
      "Both arms fabricate the same unsupplied schema; the judge splits hairs over labeling style.",
    notes: "No schema supplied; invalid fixture.",
  },
  "full:fresh-commit:5": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange: "Active returns GAP-only fields; off invents a complete fix narrative.",
    downstreamEffect:
      "The missing fix facts again decide the loss: fabrication outscores honest gaps.",
    notes: "Invalid fixture caused by missing source facts.",
  },
  "lite:fresh-commit:5": {
    classification: CLASSIFICATIONS.INVALID_FIXTURE,
    omissionOrChange:
      "Active fills Subject and Body with GAP templates; off invents the full story with a verification claim.",
    downstreamEffect:
      "Same fixture gap: the mode difference cannot be measured through invented content.",
    notes: "Invalid fixture caused by missing source facts.",
  },
};

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function protectedItemsFor(category) {
  return (category.requirements ?? [])
    .filter((requirement) => requirement.protected === true)
    .flatMap((requirement) =>
      [
        requirement.value,
        requirement.marker,
        requirement.phrase,
        requirement.sentence,
        requirement.count,
        ...(Array.isArray(requirement.requiredTerms) ? requirement.requiredTerms : []),
      ]
        .filter((value) => value !== undefined && value !== null)
        .map(String),
    );
}

export function buildFreshV1LossAudit() {
  const reportBytes = fs.readFileSync(SOURCE_REPORT_PATH);
  const reportHash = sha256Buffer(reportBytes);
  if (reportHash !== SOURCE_REPORT_SHA256) {
    throw new Error(
      `Source report hash mismatch: expected ${SOURCE_REPORT_SHA256}, got ${reportHash}`,
    );
  }
  const fixtureText = fs.readFileSync(SOURCE_FIXTURE_PATH, "utf8");
  const fixtureHash = hashFixtureContent(fixtureText);
  if (fixtureHash !== SOURCE_FIXTURE_SHA256) {
    throw new Error(
      `Source fixture hash mismatch: expected ${SOURCE_FIXTURE_SHA256}, got ${fixtureHash}`,
    );
  }
  const report = JSON.parse(reportBytes.toString("utf8"));
  const fixtures = JSON.parse(fixtureText);
  const categories = new Map(fixtures.categories.map((category) => [category.id, category]));
  const byKey = new Map(
    report.results.map((result) => [
      `${result.repetition}::${result.category}::${result.mode}`,
      result,
    ]),
  );

  const losses = [];
  for (const result of report.results) {
    const judge = result.judge;
    if (!judge || judge.failed === true) continue;
    if (judge.offQualityTotal <= judge.activeQualityTotal) continue;
    const identity = `${result.mode}:${result.category}:${result.repetition}`;
    const analysis = LOSS_ANALYSIS[identity];
    if (analysis === undefined) {
      throw new Error(`No recorded analysis for judge loss '${identity}'.`);
    }
    const category = categories.get(result.category);
    if (category === undefined) {
      throw new Error(`Loss references unknown fixture category '${result.category}'.`);
    }
    const off = byKey.get(`${result.repetition}::${result.category}::off`);
    if (off === undefined) {
      throw new Error(`Loss '${identity}' has no paired off result.`);
    }
    losses.push({
      identity,
      mode: result.mode,
      category: result.category,
      repetition: result.repetition,
      judgeNotes: judge.notes,
      offQualityTotal: judge.offQualityTotal,
      activeQualityTotal: judge.activeQualityTotal,
      offGroundingTotal: judge.offGroundingTotal,
      activeGroundingTotal: judge.activeGroundingTotal,
      prompt: category.prompt,
      suppliedFacts: SUPPLIED_FACTS[result.category],
      protectedItems: protectedItemsFor(category),
      offResponse: off.validationText ?? off.response,
      activeResponse: result.validationText ?? result.response,
      offBehavioralPassed: off.behavioralPassed === true,
      activeBehavioralPassed: result.behavioralPassed === true,
      ...analysis,
    });
  }
  losses.sort((a, b) =>
    a.mode === b.mode
      ? a.repetition - b.repetition || a.category.localeCompare(b.category)
      : a.mode.localeCompare(b.mode),
  );
  const liteCount = losses.filter((loss) => loss.mode === "lite").length;
  const fullCount = losses.filter((loss) => loss.mode === "full").length;
  if (liteCount !== 8 || fullCount !== 8) {
    throw new Error(
      `Expected 8 lite and 8 full judge losses; found ${liteCount} lite and ${fullCount} full.`,
    );
  }
  const audit = {
    version: FRESH_V1_LOSS_AUDIT_VERSION,
    generator: "scripts/eval/fresh-v1-loss-audit.mjs",
    sourceReportPath: "evaluation/results/fresh-v1-v9.json",
    sourceReportSha256: reportHash,
    sourceFixturePath: "scripts/evaluation-fixtures-fresh-v1.json",
    sourceFixtureSha256: fixtureHash,
    externalModelCalls: 0,
    losses,
  };
  audit.markdown = renderFreshV1LossAuditMarkdown(audit);
  return audit;
}

function classificationCount(audit, classification) {
  return audit.losses.filter((loss) => loss.classification === classification).length;
}

export function renderFreshV1LossAuditMarkdown(audit) {
  const counts = Object.values(CLASSIFICATIONS)
    .map((classification) => `| ${classification} | ${classificationCount(audit, classification)} |`)
    .join("\n");
  const classificationCode = (classification) => {
    if (classification === CLASSIFICATIONS.INVALID_FIXTURE) return "IF";
    if (classification === CLASSIFICATIONS.REQUIRED_INFORMATION_LOSS) return "RI";
    return "OT";
  };
  const rows = audit.losses
    .map((loss, index) =>
      `| \`/losses/${index}\` | ${loss.mode} | ${loss.category} | ${loss.repetition} | ${loss.offQualityTotal}-${loss.activeQualityTotal} | ${classificationCode(loss.classification)} |`,
    )
    .join("\n");
  return `# Fresh-v1 judge-loss audit (v${audit.version})

This audit covers 16 fresh-v1 judge losses. Eight involve \`lite\`, and eight involve \`full\`.

Complete case records are in \`fresh-v1-v9-judge-loss-audit.json\`. Each record includes raw responses and all requested audit fields. Each table row gives its JSON pointer.

| Source | SHA-256 |
| --- | --- |
| \`${audit.sourceReportPath}\` | \`${audit.sourceReportSha256}\` |
| \`${audit.sourceFixturePath}\` | \`${audit.sourceFixtureSha256}\` |

The generator is \`${audit.generator}\`. It made ${audit.externalModelCalls} external model calls.

## Classification totals

| Classification | Count |
| --- | ---: |
${counts}

Case codes are IF for invalid fixtures, RI for required-information loss, and OT for other findings.

Ten losses come from commit and configuration tasks with missing source facts. One \`lite\` response omits the exact lowercase phrase \`do not share\`. Its sentence-word check is an incorrect word-count validator. Five losses concern technical overstatement or judge style preference.

## Case index

| JSON pointer | Mode | Category | Repetition | Quality score off-active | Code |
| --- | --- | --- | ---: | ---: | --- |
${rows}
`;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const audit = buildFreshV1LossAudit();
  const outputMarkdown = path.join(ROOT, "evaluation", "results", "fresh-v1-v9-judge-loss-audit.md");
  const outputJson = path.join(ROOT, "evaluation", "results", "fresh-v1-v9-judge-loss-audit.json");
  const { markdown, ...jsonAudit } = audit;
  fs.writeFileSync(outputJson, `${JSON.stringify(jsonAudit, null, 2)}\n`, "utf8");
  fs.writeFileSync(outputMarkdown, markdown, "utf8");
}
