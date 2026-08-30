#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const PHASES = {
  preflight: {
    repetitions: "3",
    categories: "v4-siren-alert,v4-nested-ledger",
    cacheCondition: "cold",
    cachePromptStrategy: "unique-arm",
    judge: "0",
    output: "evaluation/results/fresh-v4-preflight.json",
  },
  cold: {
    repetitions: "5",
    categories: "",
    cacheCondition: "cold",
    cachePromptStrategy: "unique-arm",
    judge: "1",
    output: "evaluation/results/fresh-v4-cold-controlled-v1.json",
  },
  warmup: {
    repetitions: "3",
    categories: "",
    cacheCondition: "warm",
    cachePromptStrategy: "shared",
    judge: "0",
    output: "evaluation/results/fresh-v4-warmup-shared-v1.json",
  },
  warm: {
    repetitions: "5",
    categories: "",
    cacheCondition: "warm",
    cachePromptStrategy: "shared",
    judge: "1",
    output: "evaluation/results/fresh-v4-warm-controlled-v1.json",
  },
};

export function phaseEnvironment(phase, baseEnvironment = process.env) {
  const config = PHASES[phase];
  if (config === undefined) {
    throw new Error(`Unknown selective-final phase '${phase}'.`);
  }
  return {
    ...baseEnvironment,
    CAVEMAN_EVAL_FIXTURE_SET: "fresh-v4",
    CAVEMAN_EVAL_PROVIDER: "pi",
    CAVEMAN_EVAL_MODES: "off,selective-final-v11",
    CAVEMAN_EVAL_REPETITIONS: config.repetitions,
    CAVEMAN_EVAL_PAIR_ORDER: "alternating",
    CAVEMAN_EVAL_CACHE_CONDITION: config.cacheCondition,
    CAVEMAN_EVAL_CACHE_PROMPT_STRATEGY: config.cachePromptStrategy,
    CAVEMAN_EVAL_JUDGE: config.judge,
    CAVEMAN_EVAL_OUTPUT: baseEnvironment.CAVEMAN_EVAL_OUTPUT ?? config.output,
    ...(config.categories.length === 0
      ? { CAVEMAN_EVAL_CATEGORIES: "" }
      : { CAVEMAN_EVAL_CATEGORIES: config.categories }),
  };
}

export async function runPhase(phase, options = {}) {
  const env = phaseEnvironment(phase, options.env ?? process.env);
  if (env.CAVEMAN_EVAL_ALLOW_PAID !== "1") {
    throw new Error("Selective-final evaluation requires CAVEMAN_EVAL_ALLOW_PAID=1.");
  }
  if (!/^\d+$/.test(env.CAVEMAN_EVAL_MAX_PAID_CALLS ?? "")) {
    throw new Error("Selective-final evaluation requires CAVEMAN_EVAL_MAX_PAID_CALLS.");
  }
  const spawnImpl = options.spawnImpl ?? spawn;
  const child = spawnImpl(process.execPath, [path.join(root, "scripts", "evaluate.mjs")], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(0);
      else reject(new Error(`Selective-final ${phase} failed with ${signal ?? `exit ${code}`}.`));
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPhase(process.argv[2] ?? "").catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
