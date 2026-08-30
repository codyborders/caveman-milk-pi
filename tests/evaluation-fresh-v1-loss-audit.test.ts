// Fresh-v1 judge-loss audit contract: every one of the 16 blinded-judge
// losses (8 lite, 8 full) must appear with the full prompt, supplied facts,
// complete off and active responses, protected items, omission/change,
// downstream effect, and exactly one classification. Red initial failure:
// the committed audit artifact did not exist (readFileSync exited 1 with
// ENOENT for fresh-v1-v9-judge-loss-audit.md).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFreshV1LossAudit,
  FRESH_V1_LOSS_AUDIT_VERSION,
} from "../scripts/eval/fresh-v1-loss-audit.mjs";

const root = path.resolve(import.meta.dirname, "..");
const auditPath = path.join(root, "evaluation/results/fresh-v1-v9-judge-loss-audit.md");
const auditJsonPath = path.join(root, "evaluation/results/fresh-v1-v9-judge-loss-audit.json");

describe("fresh-v1 judge-loss audit", () => {
  it("covers all 16 losses with complete raw data and one classification each", () => {
    const audit = buildFreshV1LossAudit();

    expect(audit.version).toBe(FRESH_V1_LOSS_AUDIT_VERSION);
    expect(FRESH_V1_LOSS_AUDIT_VERSION).toBe(1);
    expect(audit.sourceReportSha256).toBe(
      "a40d29aa6d4ec9f4dff573caef559ff3f59f8fc5c52ff30f0121e36efab98ac2",
    );
    expect(audit.sourceFixtureSha256).toBe(
      "d961c987a01da8fe2280037489cca42e6c1f303fc06e9d570495dffde3818e3e",
    );
    expect(audit.losses).toHaveLength(16);
    expect(audit.losses.filter((loss) => loss.mode === "lite")).toHaveLength(8);
    expect(audit.losses.filter((loss) => loss.mode === "full")).toHaveLength(8);

    const classificationCounts = audit.losses.reduce((counts, loss) => {
      counts[loss.classification] = (counts[loss.classification] ?? 0) + 1;
      return counts;
    }, {});
    expect(classificationCounts).toEqual({
      "Invalid fixture caused by missing source facts": 10,
      "Actual required-information loss": 1,
      Other: 5,
    });

    const source = JSON.parse(
      readFileSync(path.join(root, "evaluation/results/fresh-v1-v9.json"), "utf8"),
    );
    const byKey = new Map(
      source.results.map((r) => [`${r.repetition}::${r.category}::${r.mode}`, r]),
    );
    for (const loss of audit.losses) {
      expect(loss.prompt.length).toBeGreaterThan(0);
      expect(loss.suppliedFacts.length).toBeGreaterThan(0);
      expect(loss.protectedItems.length).toBeGreaterThan(0);
      expect(loss.offResponse.length).toBeGreaterThan(0);
      expect(loss.activeResponse.length).toBeGreaterThan(0);
      expect(loss.omissionOrChange.length).toBeGreaterThan(0);
      expect(loss.downstreamEffect.length).toBeGreaterThan(0);
      // Responses must be verbatim raw data, not paraphrases.
      const active = byKey.get(`${loss.repetition}::${loss.category}::${loss.mode}`);
      const off = byKey.get(`${loss.repetition}::${loss.category}::off`);
      expect(loss.activeResponse).toBe(active.validationText ?? active.response);
      expect(loss.offResponse).toBe(off.validationText ?? off.response);
      expect(loss.offQualityTotal).toBeGreaterThan(loss.activeQualityTotal);
    }
  });

  it("commits complete JSON data plus the rendered Markdown index", () => {
    const audit = buildFreshV1LossAudit();
    const markdown = readFileSync(auditPath, "utf8");
    const savedJson = JSON.parse(readFileSync(auditJsonPath, "utf8"));
    expect(savedJson.losses).toEqual(audit.losses);
    expect(savedJson.markdown).toBeUndefined();
    expect(markdown).toBe(audit.markdown);
    expect(markdown).toContain("16 fresh-v1 judge losses");
    expect(markdown).toContain("| Invalid fixture caused by missing source facts | 10 |");
    expect(markdown).toContain("| Actual required-information loss | 1 |");
    expect(markdown).toContain("| Other | 5 |");
    expect(markdown).toContain("do not share");
    expect(markdown).toContain("word-count validator");
    expect(JSON.stringify(savedJson)).toContain("not valid JSON");
  });
});
