import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("offline rescore", () => {
  it("reuses stored responses without invoking Pi or a provider", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "caveman-rescore-test-"));
    const marker = path.join(dir, "called");
    const stub = path.join(dir, "pi-stub.mjs");
    writeFileSync(stub, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "called"); process.exit(99);\n`);
    const output = path.join(dir, "rescore.json");
    const markdown = path.join(dir, "rescore.md");
    try {
      execFileSync(process.execPath, ["scripts/eval/rescore.mjs"], {
        env: { ...process.env, CAVEMAN_RESCORE_OUTPUT: output, CAVEMAN_RESCORE_MARKDOWN: markdown, CAVEMAN_EVAL_PI_BIN: stub },
        stdio: "pipe",
      });
      const report = JSON.parse(readFileSync(output, "utf8"));
      expect(report.rescore.sourceRunId).toBe("caveman-eval-d37242b07e700ebd");
      expect(report.rescore.sourceReportHash).toBe("0e4a254968b0448b2df9e707d04c6bbc7c760c1b3b4a9dfb3ea07cfe6409feeb");
      expect(report.compression.byMode.lite.eligiblePairCount).toBe(23);
      expect(report.compression.byMode.full.eligiblePairCount).toBe(26);
      expect(report.attribution.byMode.lite.byCategory.negation.correctness).toMatchObject({ activeFailedOffPassed: 2, bothFailed: 1 });
      expect(report.attribution.byMode.full.byCategory["irreversible-confirmation"].safety).toMatchObject({ activeFailedOffPassed: 2, bothPassed: 1 });
      expect(report.attribution.byMode.full.byCategory["commit-pr"].overall).toMatchObject({ activeFailedOffPassed: 0, activePassedOffFailed: 1, bothFailed: 2 });
      expect(report.attribution.byMode.lite.byCategory.clarification.overall).toMatchObject({ activeFailedOffPassed: 1, bothPassed: 2 });
      expect(report.rescore.evaluatorCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(report.rescore.generationTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(readFileSync(markdown, "utf8")).toContain("| Rescored | yes |");
      expect(() => readFileSync(marker)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the paid source immutable and rejects output collisions", () => {
    const source = "evaluation/results/benchmark-regression-v2.json";
    const before = readFileSync(source);
    const beforeHash = createHash("sha256").update(before).digest("hex");
    const directOverwrite = spawnSync(process.execPath, ["scripts/eval/rescore.mjs"], {
      env: { ...process.env, CAVEMAN_RESCORE_OUTPUT: source },
      encoding: "utf8",
    });
    expect(directOverwrite.status).not.toBe(0);
    expect(directOverwrite.stderr).toContain("must not overwrite source report");
    expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(beforeHash);

    const dir = mkdtempSync(path.join(os.tmpdir(), "caveman-rescore-collision-"));
    const sharedOutput = path.join(dir, "shared-output");
    try {
      const sameDestination = spawnSync(process.execPath, ["scripts/eval/rescore.mjs"], {
        env: {
          ...process.env,
          CAVEMAN_RESCORE_OUTPUT: sharedOutput,
          CAVEMAN_RESCORE_MARKDOWN: sharedOutput,
        },
        encoding: "utf8",
      });
      expect(sameDestination.status).not.toBe(0);
      expect(sameDestination.stderr).toContain("must use different paths");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces byte-identical rescored JSON at one evaluator commit", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "caveman-rescore-repeat-"));
    const first = path.join(dir, "first.json");
    const second = path.join(dir, "second.json");
    try {
      for (const output of [first, second]) {
        execFileSync(process.execPath, ["scripts/eval/rescore.mjs"], {
          env: {
            ...process.env,
            CAVEMAN_RESCORE_OUTPUT: output,
            CAVEMAN_RESCORE_MARKDOWN: `${output}.md`,
          },
          stdio: "pipe",
        });
      }
      expect(readFileSync(second)).toEqual(readFileSync(first));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
