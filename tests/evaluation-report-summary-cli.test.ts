// Report summary CLI coverage. The command reads one raw report and writes
// deterministic Markdown without environment-specific data.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("evaluation report summary CLI", () => {
  it("writes deterministic methodology Markdown from a report", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-summary-cli-"));
    try {
      const inputPath = path.join(directory, "report.json");
      const outputPath = path.join(directory, "methodology.md");
      fs.writeFileSync(
        inputPath,
        JSON.stringify({
          schemaVersion: 3,
          runId: "run-summary-cli",
          provider: "pi",
          runner: "pi",
          model: "primary-model",
          seed: "0xc0ffee02",
          judge: { enabled: false, model: null },
          pricing: null,
          paidCallAccounting: {
            cap: 1,
            actual: { provider: 1, judge: 0, countEndpoint: 0, total: 1 },
          },
          aggregates: { byMode: { off: { outputTokenRatio: null } } },
          results: [
            {
              mode: "off",
              passed: true,
              validationPassed: true,
              brevityPassed: true,
              qualityPassed: true,
              assistantTurns: 1,
              costUsd: 0.001,
              usage: { input: 10, output: 5, cacheWrite: 2, cacheRead: 3 },
              judge: null,
            },
          ],
        }),
        "utf8",
      );

      execFileSync(
        process.execPath,
        ["scripts/render-evaluation-summary.mjs", inputPath, outputPath],
        { cwd: repositoryRoot, encoding: "utf8" },
      );

      const markdown = fs.readFileSync(outputPath, "utf8");
      expect(markdown).toContain("# Evaluation Report Summary");
      expect(markdown).toContain("`run-summary-cli`");
      expect(markdown).toContain("| Assistant model turns | 1 |");
      expect(markdown).not.toContain(directory);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
