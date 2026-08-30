#!/usr/bin/env node
// CLI entry for the shared-prefix concise contract v12 evaluation.
//
// Defaults to the structural offline report: no process launches, no model
// calls. The paid Pi path additionally requires CAVEMAN_EVAL_ALLOW_PAID=1,
// CAVEMAN_EVAL_MODEL, and CAVEMAN_EVAL_MAX_PAID_CALLS as a hard reservation
// cap; the run refuses to start when the plan exceeds the cap. Environment
// controls: CAVEMAN_EVAL_REPETITIONS, CAVEMAN_EVAL_SEED, CAVEMAN_EVAL_OUTPUT,
// CAVEMAN_EVAL_CHECKPOINT, CAVEMAN_EVAL_CAPTURE_DIR, CAVEMAN_EVAL_PI_BIN,
// CAVEMAN_EVAL_TIMEOUT_MS, CAVEMAN_EVAL_JUDGE with CAVEMAN_EVAL_JUDGE_MODEL.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSharedPrefixV12Evaluation } from "./shared-prefix-v12-runner.mjs";
import { createDefaultLaunchNode } from "./shared-prefix-v12-launch.mjs";

function parseIntegerEnvironment(name, value) {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be an integer greater than or equal to 1.`);
  }
  return parsed;
}

function paidOptionsFromEnvironment() {
  const allowPaid = process.env.CAVEMAN_EVAL_ALLOW_PAID === "1";
  if (allowPaid !== true) {
    return { allowPaid };
  }
  const maxPaidProcesses = parseIntegerEnvironment(
    "CAVEMAN_EVAL_MAX_PAID_CALLS",
    process.env.CAVEMAN_EVAL_MAX_PAID_CALLS,
  );
  if (maxPaidProcesses === undefined) {
    throw new Error(
      "Paid shared-prefix v12 evaluation requires CAVEMAN_EVAL_MAX_PAID_CALLS as the process reservation cap.",
    );
  }
  const model = process.env.CAVEMAN_EVAL_MODEL;
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("Paid shared-prefix v12 evaluation requires CAVEMAN_EVAL_MODEL.");
  }
  const judgeEnabled = process.env.CAVEMAN_EVAL_JUDGE === "1";
  let judgeModel = null;
  if (judgeEnabled) {
    judgeModel = process.env.CAVEMAN_EVAL_JUDGE_MODEL;
    if (typeof judgeModel !== "string" || judgeModel.length === 0) {
      throw new Error(
        "The shared-prefix v12 judge model (CAVEMAN_EVAL_JUDGE_MODEL) is required before any launch.",
      );
    }
  }
  return { allowPaid, maxPaidProcesses, model, judgeEnabled, judgeModel };
}

// Deterministic identical-source judge: both texts come from finalizer arms
// over the same locked canonical bytes. The verdict feeds the critical-loss
// and unsupported-claim gates; usage stays outside primary metrics.
function createJudgeImpl({ judgeModel, piBin, timeoutMs }) {
  const judgeLaunch = createDefaultLaunchNode({ model: judgeModel, piBin, timeoutMs });
  return async function judgeImpl({ taskPrompt, offText, candidateText, requiredFacts }) {
    const prompt = [
      "Compare two final answers produced from identical source context.",
      taskPrompt !== null ? `Original task: ${taskPrompt}` : null,
      `Required facts: ${JSON.stringify(requiredFacts ?? [])}`,
      `Answer A:\n${offText}`,
      `Answer B:\n${candidateText}`,
      "Decide for Answer B relative to Answer A. Reply with one JSON object only:",
      '{"candidateLostRequiredFact": <boolean>, "candidateUnsupportedClaim": <boolean>}',
      "candidateLostRequiredFact is true when B drops or weakens a required fact or qualification that A keeps.",
      "candidateUnsupportedClaim is true when B states a claim the source context does not support.",
    ]
      .filter((line) => line !== null)
      .join("\n");
    const outcome = await judgeLaunch({
      kind: "judge",
      taskId: "judge",
      nodeId: "judge",
      phase: "measured",
      prompt,
    });
    const start = outcome.text.indexOf("{");
    const end = outcome.text.lastIndexOf("}");
    let verdict = null;
    if (start !== -1 && end > start) {
      try {
        verdict = JSON.parse(outcome.text.slice(start, end + 1));
      } catch {
        verdict = null;
      }
    }
    const booleanish = (value) => value === true;
    return {
      usage: outcome.usage,
      rawUsage: null,
      candidateLostRequiredFact: booleanish(verdict?.candidateLostRequiredFact),
      candidateUnsupportedClaim: booleanish(verdict?.candidateUnsupportedClaim),
      parseFailed: verdict === null,
    };
  };
}

async function main() {
  const provider = process.env.CAVEMAN_EVAL_PROVIDER ?? "offline";
  if (provider !== "offline" && provider !== "pi") {
    throw new Error(
      `Unsupported provider '${provider}'. Supported providers: offline, pi.`,
    );
  }
  const paid = paidOptionsFromEnvironment();
  const timeoutMs = parseIntegerEnvironment(
    "CAVEMAN_EVAL_TIMEOUT_MS",
    process.env.CAVEMAN_EVAL_TIMEOUT_MS,
  );
  const launchNode =
    provider === "pi" && paid.allowPaid === true
      ? createDefaultLaunchNode({
          model: paid.model,
          piBin: process.env.CAVEMAN_EVAL_PI_BIN,
          timeoutMs,
        })
      : undefined;
  const judgeImpl =
    provider === "pi" && paid.judgeEnabled === true
      ? createJudgeImpl({
          judgeModel: paid.judgeModel,
          piBin: process.env.CAVEMAN_EVAL_PI_BIN,
          timeoutMs,
        })
      : null;
  const workspaceRoot =
    provider === "pi"
      ? fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"))
      : undefined;
  const captureDir =
    provider === "pi"
      ? process.env.CAVEMAN_EVAL_CAPTURE_DIR ??
        path.resolve(process.cwd(), "shared-prefix-v12-captures")
      : undefined;
  const report = await runSharedPrefixV12Evaluation({
    provider,
    ...paid,
    launchNode,
    judgeImpl,
    seed: process.env.CAVEMAN_EVAL_SEED,
    repetitions: parseIntegerEnvironment(
      "CAVEMAN_EVAL_REPETITIONS",
      process.env.CAVEMAN_EVAL_REPETITIONS,
    ),
    workspaceRoot,
    captureDir,
    checkpointPath: process.env.CAVEMAN_EVAL_CHECKPOINT,
  });
  const serialized = JSON.stringify(report, null, 2) + "\n";
  const outputPath = process.env.CAVEMAN_EVAL_OUTPUT;
  if (outputPath === undefined || outputPath.length === 0) {
    process.stdout.write(serialized);
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, "utf8");
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
