#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { renderSummaryMarkdown, summarizeReport } from "./eval/report-summary.mjs";

const [inputPath, outputPath] = process.argv.filter((_, index) => index >= 2);
if (typeof inputPath !== "string" || typeof outputPath !== "string") {
  throw new Error(
    "Usage: node scripts/render-evaluation-summary.mjs <report.json> <methodology.md>",
  );
}

const report = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const markdown = renderSummaryMarkdown(summarizeReport(report));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown, { encoding: "utf8", mode: 0o600 });
