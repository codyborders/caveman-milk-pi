#!/usr/bin/env node

// Deterministic development checks for prompt contract v10. No provider call
// runs here. The checks compare the live contract against the preserved v9
// baseline record, verify the predeclared 25 percent reduction on every
// active mode, and run the locked fresh-v2 fixture set as a development
// regression input.

import * as crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOfflineReport, loadFixtures } from "../evaluate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const ACTIVE_MODES = [
  "lite",
  "full",
  "ultra",
  "wenyan-lite",
  "wenyan",
  "wenyan-ultra",
];
const COVERAGE_TERMS = [
  "scope",
  "conditions",
  "uncertainty",
  "warnings",
  "negation",
  "exact required text",
  "facts",
  "identifiers",
  "paths",
  "values",
  "commands",
  "order",
  "code",
  "tool args",
  "files",
  "commits",
  "PRs",
  "docs",
  "handoffs both ways",
  "gaps",
  "certainty",
  "completion",
];

const failures = [];
const fail = (message) => {
  failures.push(message);
  process.stderr.write(`FAIL: ${message}\n`);
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function injectedPrompt(contract, mode) {
  const label = mode === "wenyan" ? "wenyan-full" : mode;
  return (
    `\n\nCAVEMAN MODE ACTIVE — level: ${label}\n` +
    contract.commonRules +
    contract.modeRules[mode]
  );
}

function main() {
  process.stdout.write("prompt contract v10 development check\n");

  const experiment = readJson("evaluation/prompt-experiment-v10.json");
  const baseline = experiment.baseline;
  const baselineRecomputed = crypto
    .createHash("sha256")
    .update(JSON.stringify(baseline.contract))
    .digest("hex");
  if (baselineRecomputed !== baseline.contractSha256) {
    fail("baseline record hash mismatch: the stored v9 contract text changed.");
  }

  const contract = readJson("src/prompt-contract.json");
  if (contract.version !== 10) {
    fail(`contract version is ${contract.version}, expected 10.`);
  }
  if (JSON.stringify(contract.modeRules) !== JSON.stringify(baseline.contract.modeRules)) {
    fail("mode rules differ from the v9 baseline; only the common contract may change.");
  }
  if (
    contract.tokenAccounting?.method !== baseline.contract.tokenAccounting.method ||
    contract.tokenAccounting?.endpointPath !== baseline.contract.tokenAccounting.endpointPath
  ) {
    fail("token accounting method or endpoint changed.");
  }
  if (typeof contract.commonRules !== "string" || contract.commonRules.length === 0) {
    fail("common rules must be a nonempty string.");
  }

  const minimumReduction = experiment.target.minimumFullyInjectedTokenReduction;
  for (const mode of ACTIVE_MODES) {
    const v9Tokens = Math.round(baseline.runtimePrompts[mode].length / 4);
    const v10Text = injectedPrompt(contract, mode);
    const v10Tokens = Math.round(v10Text.length / 4);
    const reduction = (v9Tokens - v10Tokens) / v9Tokens;
    const percent = (reduction * 100).toFixed(1);
    process.stdout.write(`mode ${mode}: ${v9Tokens} -> ${v10Tokens} tokens (${percent}%)\n`);
    if (reduction < minimumReduction) {
      fail(`mode ${mode} reduction ${percent}% is below the predeclared ${(minimumReduction * 100).toFixed(0)}%.`);
    }
    if (v10Text.length > 800) {
      fail(`mode ${mode} injection is ${v10Text.length} characters, above the 800 limit.`);
    }
  }
  process.stdout.write("off: 0 characters (zero-byte)\n");

  const missingTerms = COVERAGE_TERMS.filter((term) => !contract.commonRules.includes(term));
  if (missingTerms.length > 0) {
    fail(`common rules no longer name: ${missingTerms.join(", ")}.`);
  } else {
    process.stdout.write(`coverage: all ${COVERAGE_TERMS.length} mandated categories named\n`);
  }

  const fixtures = loadFixtures("fresh-v2");
  const offline = createOfflineReport(fixtures);
  if (offline.injectionLengths.off !== 0) {
    fail("fresh-v2 off injection is not zero bytes.");
  }
  for (const [mode, length] of Object.entries(offline.injectionLengths)) {
    if (length > 800) {
      fail(`fresh-v2 mode ${mode} injection is ${length} characters, above the 800 limit.`);
    }
  }
  process.stdout.write(
    `fresh-v2 regression: fixture hash verified (${offline.fixtureHash.substring(0, 16)}), ` +
      `${offline.categoryCount} categories, ${offline.caseCount} cases\n`,
  );

  if (failures.length > 0) {
    process.stderr.write(`${failures.length} v10 development check(s) failed.\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("all v10 development checks passed\n");
}

main();
