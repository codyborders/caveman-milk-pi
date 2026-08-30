#!/usr/bin/env node
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildSharedPrefixV12FinalAnalysis,
  renderSharedPrefixV12FinalAnalysisMarkdown,
} from "./shared-prefix-v12-runner.mjs";

function parseArguments(argv) {
  const values = { preflight: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string" || !flag.startsWith("--")) {
      throw new Error(`Invalid analysis argument near ${String(flag)}.`);
    }
    const key = flag.slice(2);
    if (key === "preflight") values.preflight.push(value);
    else if (["final", "json", "markdown", "manifest", "artifact-root"].includes(key)) {
      values[key] = value;
    } else {
      throw new Error(`Unknown analysis argument: ${flag}`);
    }
  }
  for (const key of ["final", "json", "markdown", "manifest", "artifact-root"]) {
    if (typeof values[key] !== "string" || values[key].length === 0) {
      throw new Error(`Missing --${key} argument.`);
    }
  }
  if (values.preflight.length !== 3) {
    throw new Error("Analysis requires exactly three preserved preflight reports.");
  }
  return values;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, text, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function collectFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  if (!stat.isDirectory()) return [];
  return fs.readdirSync(targetPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectFiles(path.join(targetPath, entry.name)));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function buildArtifactManifest(root, derivedPaths) {
  const fixedPaths = [
    "scripts/eval/shared-prefix-v12-fixtures.json",
    "scripts/eval/shared-prefix-v12-fixture-manifest.json",
    "evaluation/results/shared-prefix-v12-preflight-v1.json",
    "evaluation/results/shared-prefix-v12-preflight-v2.json",
    "evaluation/results/shared-prefix-v12-preflight-v3.json",
    "evaluation/results/shared-prefix-v12-final-v1.json",
    "evaluation/checkpoints",
    "evaluation/captures",
  ];
  for (const derivedPath of derivedPaths) {
    const relative = path.relative(root, path.resolve(derivedPath));
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) fixedPaths.push(relative);
  }
  const files = [...new Set(fixedPaths
    .flatMap((relative) => collectFiles(path.join(root, relative)))
    .map((filePath) => path.resolve(filePath)))]
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) throw new Error("No shared-prefix v12 artifacts were found.");
  return {
    schemaVersion: "shared-prefix-v12-artifacts/1",
    fixtureSha256: readJson(path.join(root, "scripts/eval/shared-prefix-v12-fixture-manifest.json")).fixtureSha256,
    artifacts: files.map((filePath) => ({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      sha256: sha256(filePath),
      bytes: fs.statSync(filePath).size,
    })),
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const finalReport = readJson(options.final);
  const preflightReports = options.preflight.map(readJson);
  const analysis = buildSharedPrefixV12FinalAnalysis(finalReport, preflightReports);
  const jsonText = `${JSON.stringify(analysis, null, 2)}\n`;
  const markdownText = renderSharedPrefixV12FinalAnalysisMarkdown(analysis);
  writeAtomic(options.json, jsonText);
  writeAtomic(options.markdown, markdownText);
  const manifest = buildArtifactManifest(path.resolve(options["artifact-root"]), [options.json, options.markdown]);
  writeAtomic(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return analysis;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
