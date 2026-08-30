// End-to-end runner tests for the shared-prefix v12 evaluation. The runner
// captures one Caveman-off base execution per task, locks the canonical
// source context, replays it through the off and candidate finalizer arms,
// validates per-node cold/warm cache state, enforces paid process caps, and
// reports paired intervals with fail-closed gates. A fake launchNode stands
// in for Pi processes so no paid model trial ever runs in tests.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATE_CONTRACT_V12 } from "../scripts/eval/shared-prefix-v12.mjs";

async function loadRunner() {
  try {
    return await import("../scripts/eval/shared-prefix-v12-runner.mjs");
  } catch {
    return null;
  }
}

describe("shared-prefix v12 runner", () => {
  it("loads as an evaluator module outside runtime paths", async () => {
    const runner = await loadRunner();
    expect(runner).not.toBeNull();
    expect(typeof runner.runSharedPrefixV12Evaluation).toBe("function");
  });
});