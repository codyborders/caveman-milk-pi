// Behavioral contract for the shared-prefix v12 runner: three-arm topology
// with measured warm setup, alternating finalizer arm order, protected
// bypass with zero candidate injection, and separately preserved support
// attempts. A fake launchNode stands in for Pi processes so no paid model
// trial ever runs.

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

const fixtures = {
  version: 12,
  groups: [
    {
      id: "eligible-prose",
      classification: "eligible",
      tasks: [
        {
          id: "eligible-comparison",
          kind: "comparison",
          prompt: "Compare the two queues and recommend one. Cover throughput.",
          requiredFacts: ["throughput"],
          childTasks: [
            "Report the ring queue numbers.",
            "Report the heap queue numbers.",
          ],
        },
      ],
    },
    {
      id: "protected-content",
      classification: "protected",
      tasks: [
        {
          id: "protected-warning",
          kind: "warning",
          prompt: "State the production warning. Keep PRODUCTION WARNING.",
          requiredFacts: ["PRODUCTION WARNING"],
        },
      ],
    },
  ],
};

function createFakeLauncher() {
  const launches = [];
  const launchNode = async (request) => {
    launches.push(request);
    const cacheRead = request.phase === "measured" ? 400 : 0;
    const usage = { input: 20, output: 8, cacheRead, cacheWrite: 4 };
    return {
      text: `Final answer covering ${request.requiredFacts.join(" and ")}.`,
      usage,
      usageTurns: [{ ...usage }],
      rawEvents: [],
      elapsedMs: 500,
    };
  };
  return { launches, launchNode };
}

export async function runWithFakeLauncher(overrides = {}) {
  const runner = await loadRunner();
  const fake = createFakeLauncher();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));
  const report = await runner.runSharedPrefixV12Evaluation({
    fixtures,
    provider: "pi",
    allowPaid: true,
    model: "test-model",
    maxPaidProcesses: 100,
    repetitions: 3,
    seed: "0x1",
    workspaceRoot,
    captureDir,
    launchNode: fake.launchNode,
    ...overrides,
  });
  return { report, launches: fake.launches, workspaceRoot, captureDir };
}

describe("shared-prefix v12 runner behavior", () => {
  it("runs warm-then-measured three-arm topology with alternating arms and protected bypass", async () => {
    const { report, launches } = await runWithFakeLauncher();
    expect(report.arms).toEqual(["normal-off", "shared-prefix-off", "shared-prefix-candidate"]);

    const eligibleLaunches = launches.filter((launch) => launch.taskId === "eligible-comparison");
    const protectedLaunches = launches.filter((launch) => launch.taskId === "protected-warning");

    // Warm then measured for every node: two children, one parent, and the
    // two finalizer arms warmed once before three alternating repetitions.
    expect(
      eligibleLaunches.filter((launch) => launch.kind === "child" && launch.phase === "warm"),
    ).toHaveLength(2);
    expect(
      eligibleLaunches.filter((launch) => launch.kind === "child" && launch.phase === "measured"),
    ).toHaveLength(2);
    expect(
      eligibleLaunches.filter((launch) => launch.kind === "parent" && launch.phase === "warm"),
    ).toHaveLength(1);
    expect(
      eligibleLaunches.filter((launch) => launch.kind === "parent" && launch.phase === "measured"),
    ).toHaveLength(1);
    expect(
      eligibleLaunches.filter((launch) => launch.kind === "finalizer" && launch.phase === "warm"),
    ).toHaveLength(2);
    const measuredFinalizers = eligibleLaunches.filter(
      (launch) => launch.kind === "finalizer" && launch.phase === "measured",
    );
    expect(measuredFinalizers).toHaveLength(6);

    // Arm order alternates by repetition, never a fixed off-then-candidate run.
    const armSequence = measuredFinalizers.map((launch) => launch.arm).join(",");
    expect(armSequence).not.toBe(
      [
        "shared-prefix-off",
        "shared-prefix-candidate",
        "shared-prefix-off",
        "shared-prefix-candidate",
        "shared-prefix-off",
        "shared-prefix-candidate",
      ].join(","),
    );
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      const arms = measuredFinalizers
        .filter((launch) => launch.nodeId.endsWith(`rep${repetition}`))
        .map((launch) => launch.arm);
      expect(new Set(arms).size).toBe(2);
    }

    // The warmed parent request is exactly the measured parent request.
    const warmParent = eligibleLaunches.find(
      (launch) => launch.kind === "parent" && launch.phase === "warm",
    );
    const measuredParent = eligibleLaunches.find(
      (launch) => launch.kind === "parent" && launch.phase === "measured",
    );
    expect(warmParent.prompt).toBe(measuredParent.prompt);

    // Support attempts are preserved separately with first-turn reads.
    expect(Array.isArray(report.supportAttempts)).toBe(true);
    expect(report.supportAttempts.length).toBe(6);
    expect(
      report.supportAttempts.every(
        (attempt) =>
          attempt.phase === "warm" &&
          Number.isFinite(attempt.firstTurnCacheRead) &&
          attempt.firstTurnCacheRead === 0,
      ),
    ).toBe(true);

    // Protected task: warm and measured parent only, no finalizer work of any
    // phase, and no candidate bytes anywhere in its prompts.
    expect(protectedLaunches).toHaveLength(2);
    expect(protectedLaunches.every((launch) => launch.kind === "parent")).toBe(true);
    expect(
      protectedLaunches.every((launch) => !launch.prompt.includes(CANDIDATE_CONTRACT_V12)),
    ).toBe(true);
    expect(report.protectedGroup.extraFinalizerWork).toBe(0);
    expect(report.protectedGroup.injectionTokens).toBe(0);
  });
});
