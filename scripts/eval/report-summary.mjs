// Deterministic report summary.
//
// summarizeReport derives a fixed-shape summary from a provider report:
// per-mode case, validator, brevity, and judge-quality pass counts; all
// token groups; primary cost; paired output mean and median; a separate
// judge cost from judge usage and report pricing; counted process attempts;
// and assistant model turns. The corrected post-approval rerun report is
// the intended input. Rendering lands separately after its own red test.

function sumField(values, read) {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) {
    const field = read(value);
    if (typeof field !== "number" || !Number.isFinite(field)) return null;
    total += field;
  }
  return total;
}

function meanField(values, read) {
  const fields = values.map(read).filter((value) => typeof value === "number" && Number.isFinite(value));
  if (fields.length === 0) return null;
  return Number((fields.reduce((sum, value) => sum + value, 0) / fields.length).toFixed(6));
}

function sumCostUsd(values, read) {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    const field = read(value);
    if (typeof field !== "number" || !Number.isFinite(field)) return null;
    total += field;
  }
  return Number(total.toFixed(8));
}

function computeJudgeCostUsd(usage, pricing) {
  if (pricing === null || pricing === undefined) return null;
  if (
    usage === null ||
    typeof usage !== "object" ||
    usage.input === null ||
    usage.output === null ||
    usage.cacheWrite === null ||
    usage.cacheRead === null
  ) {
    return null;
  }
  const cost =
    (usage.input / 1e6) * pricing.inputPerMTok +
    (usage.output / 1e6) * pricing.outputPerMTok +
    (usage.cacheWrite / 1e6) * pricing.cacheWritePerMTok +
    (usage.cacheRead / 1e6) * pricing.cacheReadPerMTok;
  return Number(cost.toFixed(8));
}

/**
 * @param {{ results?: Array<Record<string, unknown>> }} report
 * @returns {Record<string, unknown>}
 */
export function summarizeReport(report) {
  if (report === null || typeof report !== "object") {
    throw new Error("summarizeReport requires a report object.");
  }
  const results = Array.isArray(report.results) ? report.results : [];
  const judgeEnabled = report.judge?.enabled === true;
  const pricing = report.pricing ?? null;
  const schema4 = report.schemaVersion === 4;
  const observedModes = [];
  for (const result of results) {
    if (!observedModes.includes(result.mode)) observedModes.push(result.mode);
  }
  const configuredModes = Array.isArray(report.modes) ? report.modes : [];
  const modeOrder = [
    ...configuredModes.filter((mode) => observedModes.includes(mode)),
    ...observedModes.filter((mode) => !configuredModes.includes(mode)),
  ];
  const modes = modeOrder.map((mode) => {
    const modeResults = results.filter((result) => result.mode === mode);
    const ratio = report.aggregates?.byMode?.[mode]?.outputTokenRatio ?? null;
    const compression = report.compression?.byMode?.[mode] ?? null;
    const common = {
      mode,
      cases: modeResults.length,
      passedCases: modeResults.filter((result) => result.passed === true).length,
      inputTokens: sumField(modeResults, (result) => result.usage?.input),
      cacheWriteTokens: sumField(modeResults, (result) => result.usage?.cacheWrite),
      cacheReadTokens: sumField(modeResults, (result) => result.usage?.cacheRead),
      outputTokens: sumField(modeResults, (result) => result.usage?.output),
      primaryCostUsd: sumCostUsd(modeResults, (result) => result.costUsd),
      pairedOutputMean: typeof ratio?.mean === "number" ? ratio.mean : null,
      pairedOutputMedian: typeof ratio?.median === "number" ? ratio.median : null,
    };
    if (schema4) {
      return {
        ...common,
        behavioralPasses: modeResults.filter((result) => result.behavioralPassed === true).length,
        correctnessPasses: modeResults.filter((result) => result.correctnessPass === true).length,
        groundednessPasses: modeResults.filter((result) => result.groundednessPass === true).length,
        contractPasses: modeResults.filter((result) => result.contractPass === true).length,
        safetyPasses: modeResults.filter((result) => result.safetyPass === true).length,
        qualityScoreMean: meanField(modeResults, (result) => result.qualityScore),
        groundingScoreMean: meanField(modeResults, (result) => result.groundingScore),
        brevityScoreMean: compression?.brevityScore?.mean ?? null,
        compressionRatioMean: compression?.compressionRatio?.mean ?? null,
        compressionEligiblePairs: compression?.eligiblePairCount ?? 0,
      };
    }
    return {
      ...common,
      validatorPasses: modeResults.filter((result) => result.validationPassed === true).length,
      brevityPasses: modeResults.filter((result) => result.brevityPassed === true).length,
      judgeQualityPasses:
        judgeEnabled && mode !== "off"
          ? modeResults.filter((result) => result.qualityPassed === true).length
          : null,
    };
  });
  const judgeRecords = judgeEnabled
    ? results.filter((result) => result.judge !== null && result.judge !== undefined)
    : [];
  return {
    schemaVersion: report.schemaVersion ?? null,
    fixtureSet: report.fixtureSet ?? null,
    fixtureHash: report.fixtureHash ?? null,
    runId: report.runId ?? null,
    provider: report.provider ?? null,
    runner: report.runner ?? null,
    model: report.model ?? null,
    seed: report.seed ?? null,
    repetitions: report.repetitions ?? null,
    categoryCount: Array.isArray(report.categories) ? report.categories.length : null,
    evaluatorCommit: report.environment?.commit ?? report.runIdentity?.commit ?? null,
    piVersion: report.environment?.piVersion ?? null,
    runtimePromptHash: report.runIdentity?.runtimePromptHash ?? null,
    promptContractHash: report.runIdentity?.promptContractHash ?? null,
    judgeEnabled,
    judgeModel: report.judge?.model ?? null,
    modes,
    totals: {
      primaryCostUsd: sumCostUsd(results, (result) => result.costUsd),
      judgeCostUsd:
        judgeRecords.length === 0
          ? null
          : sumCostUsd(judgeRecords.map((result) => result.judge), (judge) =>
              typeof judge.costUsd === "number"
                ? judge.costUsd
                : computeJudgeCostUsd(judge.usage, pricing),
            ),
      assistantModelTurns: sumField(
        [
          ...results.map((result) => result.assistantTurns),
          ...judgeRecords.map((result) => result.judge.assistantTurns),
        ],
        (turns) => turns,
      ),
      countedProcessAttempts: report.paidCallAccounting?.actual
        ? { ...report.paidCallAccounting.actual }
        : null,
      paidCallCap: report.paidCallAccounting?.cap ?? null,
    },
  };
}

function formatUsd(value) {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

function formatRatio(value) {
  return value === null ? "n/a" : value.toFixed(4);
}

function formatTokens(value) {
  return value === null ? "n/a" : value.toLocaleString("en-US");
}

/**
 * Render deterministic Markdown from stable run identity and result fields.
 * The same report always renders the same bytes.
 *
 * @param {Record<string, unknown>} summary
 * @returns {string}
 */
export function renderSummaryMarkdown(summary) {
  if (summary === null || typeof summary !== "object") {
    throw new Error("renderSummaryMarkdown requires a summary object.");
  }
  const lines = [];
  lines.push("# Evaluation Report Summary", "", "## Run identity", "");
  lines.push("| Field | Value |", "| --- | --- |");
  lines.push(`| Run | \`${summary.runId ?? "unknown"}\` |`);
  lines.push(`| Schema | ${summary.schemaVersion ?? "unknown"} |`);
  if (summary.schemaVersion === 4) {
    lines.push(`| Report passed | ${summary.passed ? "yes" : "no"} |`);
    lines.push(`| Fixture set | ${summary.fixtureSet === null ? "n/a" : `\`${summary.fixtureSet}\``} |`);
    lines.push(`| Fixture hash | ${summary.fixtureHash === null ? "n/a" : `\`${summary.fixtureHash}\``} |`);
  }
  lines.push(
    `| Provider | \`${summary.provider ?? "unknown"}\` via \`${summary.runner ?? "unknown"}\` |`,
  );
  lines.push(`| Primary model | \`${summary.model ?? "unknown"}\` |`);
  lines.push(`| Seed | \`${summary.seed ?? "unknown"}\` |`);
  lines.push(
    `| Evaluator commit | ${summary.evaluatorCommit === null ? "n/a" : `\`${summary.evaluatorCommit}\``} |`,
  );
  lines.push(`| Pi version | ${summary.piVersion === null ? "n/a" : `\`${summary.piVersion}\``} |`);
  lines.push(
    `| Runtime prompt hash | ${summary.runtimePromptHash === null ? "n/a" : `\`${summary.runtimePromptHash}\``} |`,
  );
  lines.push(
    `| Prompt contract hash | ${summary.promptContractHash === null ? "n/a" : `\`${summary.promptContractHash}\``} |`,
  );
  lines.push(`| Repetitions | ${formatTokens(summary.repetitions)} |`);
  lines.push(`| Categories | ${formatTokens(summary.categoryCount)} |`);
  lines.push(
    `| Judge | ${summary.judgeEnabled ? `enabled with \`${summary.judgeModel ?? "unknown"}\`` : "disabled"} |`,
  );
  lines.push("", "## Per-mode results", "");
  if (summary.schemaVersion === 4) {
    lines.push(
      "| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |",
    );
    lines.push(
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const mode of summary.modes) {
      lines.push(
        `| \`${mode.mode}\` | ${mode.cases} | ${mode.behavioralPasses} | ${mode.correctnessPasses} | ${mode.groundednessPasses} | ${mode.contractPasses} | ${mode.safetyPasses} | ${formatRatio(mode.qualityScoreMean)} | ${formatRatio(mode.groundingScoreMean)} | ${formatRatio(mode.brevityScoreMean)} | ${formatRatio(mode.compressionRatioMean)} | ${mode.compressionEligiblePairs} |`,
      );
    }
  } else {
    lines.push(
      "| Mode | Cases | Passed | Validator | Brevity | Judge quality | Input tok | Cache write | Cache read | Output tok | Primary cost | Paired output mean | Paired output median |",
    );
    lines.push(
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const mode of summary.modes) {
      lines.push(
        `| \`${mode.mode}\` | ${mode.cases} | ${mode.passedCases} | ${mode.validatorPasses} | ${mode.brevityPasses} | ${mode.judgeQualityPasses ?? "n/a"} | ${formatTokens(mode.inputTokens)} | ${formatTokens(mode.cacheWriteTokens)} | ${formatTokens(mode.cacheReadTokens)} | ${formatTokens(mode.outputTokens)} | ${formatUsd(mode.primaryCostUsd)} | ${formatRatio(mode.pairedOutputMean)} | ${formatRatio(mode.pairedOutputMedian)} |`,
      );
    }
  }
  const totals = summary.totals ?? {};
  lines.push("", "## Totals", "", "| Field | Value |", "| --- | ---: |");
  lines.push(`| Primary cost | ${formatUsd(totals.primaryCostUsd)} |`);
  lines.push(`| Judge cost, separate | ${formatUsd(totals.judgeCostUsd)} |`);
  lines.push(
    `| Counted process attempts | ${
      totals.countedProcessAttempts === null
        ? "n/a"
        : `${totals.countedProcessAttempts.total} total (${totals.countedProcessAttempts.provider} primary, ${totals.countedProcessAttempts.judge} judge, ${totals.countedProcessAttempts.countEndpoint} count)`
    } |`,
  );
  lines.push(`| Assistant model turns | ${formatTokens(totals.assistantModelTurns)} |`);
  lines.push(`| Paid-call cap | ${totals.paidCallCap === null ? "n/a" : totals.paidCallCap} |`);
  lines.push(
    "",
    "Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.",
    "",
  );
  return lines.join("\n");
}
