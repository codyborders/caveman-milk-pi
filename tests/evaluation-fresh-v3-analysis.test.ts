// Fresh-v3 deterministic analysis: verified cache eligibility, paired total
// tree token and latency metrics, separated user-facing versus inter-agent
// preservation, and four conjunctive gates that keep the default off unless
// every gate passes.

import { describe, expect, it } from "vitest";
import { buildFreshV3Analysis } from "../scripts/eval/fresh-v3-analysis.mjs";

const responses = {
  "v3-warning-rollback":
    "SECURITY WARNING: staging cluster rollback. Rollback may fail mid-migration. No staged backup exists. Command: migrate rollback --env staging. Path: db/migrations/0042_add_orders.sql.",
  "v3-setup-steps":
    "1. Run npm install -D metrics-cli. 2. Run npx metrics-cli init --config metrics.json. Template path: tools/metrics/config.json.",
  "v3-queue-status":
    "Queue depth is 1,204 messages. No messages were dropped. Retries wait 30 seconds. QUEUE_RETRY_LIMIT applies.",
  "v3-queue-status-lite-broken":
    "Queue depth is 1,204 messages. Retries wait 30 seconds. QUEUE_RETRY_LIMIT applies.",
  "v3-unfinished-token-filter":
    "Status: Token filtering is not implemented. No tests exist for token filtering. File: src/token-filter.ts. Known gap: token filtering remains open.",
  "v3-commit-auth":
    "Subject: fix(auth): refresh tokens on 401\nBody: src/auth.ts now retries token refresh once. No manual QA was performed.",
  "v3-nested-fix":
    "All 2 workspace tests pass. The child updated src/delay.ts. parseDelay(\"2s\") returns 2000 and invalid input returns null.",
  "v3-nested-timeout":
    "TIMEOUT_MS is now 7500. The workspace tests pass. The child raised the flag in src/flags.ts."
};

const nestedTree = {
  rootNodeId: "root",
  rootMode: null,
  rootModel: "test-model",
  children: [
    {
      nodeId: "child-1",
      parentId: "root",
      responseText: "Fixed parseDelay. All tests pass.",
      usage: { input: 200, output: 25, cacheWrite: 5, cacheRead: 40 },
      assistantTurns: 2,
      toolCallCount: 2,
      rawEvents: ["{}"]
    }
  ],
  childCount: 1,
  complete: true,
  treeTotals: null,
  rawParentEvents: ["{}"]
};

function makeResult({ mode, repetition, category, cacheRead, childCacheRead, dropNegation, breakTree }) {
  const lite = mode === "lite";
  const isNested = category === "v3-nested-fix" || category === "v3-nested-timeout";
  let response =
    category === "v3-queue-status" && lite && dropNegation
      ? responses["v3-queue-status-lite-broken"]
      : responses[category];
  const usage = {
    input: 100 + (lite ? 0 : 20),
    output: 40 + (lite ? 0 : 30),
    cacheWrite: 10,
    cacheRead
  };
  const elapsedMs = 1000 + (lite ? 0 : 200);
  const toolCalls = isNested
    ? [
        {
          name: "delegate_eval_child",
          input: {
            task:
              category === "v3-nested-fix"
                ? "Fix parseDelay in src/delay.ts. Please run the workspace tests. Do not rename parseDelay."
                : "Raise TIMEOUT_MS in src/flags.ts to 7500. Please run the workspace tests."
          }
        }
      ]
    : [];
  const nested = isNested
    ? {
        ...nestedTree,
        rootMode: mode,
        complete: breakTree ? false : true,
        children: breakTree
          ? []
          : nestedTree.children.map((child) => ({
              ...child,
              usage: { ...child.usage, cacheRead: childCacheRead },
            })),
        childCount: breakTree ? 0 : 1
      }
    : null;
  return {
    key: `${repetition}::${category}::${mode}`,
    repetition,
    category,
    mode,
    response,
    usage,
    elapsedMs,
    assistantTurns: isNested ? 3 : 1,
    timing: {
      timeToFirstTokenMs: 200 + (lite ? 0 : 60),
      generationDurationMs: 800 + (lite ? 0 : 140),
      totalElapsedMs: elapsedMs
    },
    toolCalls,
    toolMetrics: { toolCalls: toolCalls.length, rereads: 0, correctiveTurns: 0, retries: null },
    sessionToolMetrics: isNested
      ? { testsRun: 1, passingTestRuns: 1, finalTestRunPassed: true, correctiveTurns: 0, rereads: 0 }
      : null,
    nested
  };
}

function makeRun({ id, cacheRead, childCacheRead = cacheRead, dropNegation = false, breakTree = false }) {
  const categories = ["v3-warning-rollback", "v3-setup-steps", "v3-queue-status", "v3-unfinished-token-filter", "v3-commit-auth", "v3-nested-fix", "v3-nested-timeout"];
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (const category of categories) {
      for (const mode of ["off", "lite"]) {
        results.push(makeResult({ mode, repetition, category, cacheRead, childCacheRead, dropNegation, breakTree }));
      }
    }
  }
  return {
    runIdentity: { runId: `synthetic-${id}`, commit: "deadbeef" },
    paidCallAccounting: { actual: { provider: 42, judge: 0 } },
    results
  };
}

const controlledRuns = [
  { id: "cold", cacheRule: "zero", raw: makeRun({ id: "cold", cacheRead: 0, dropNegation: true }) },
  { id: "warm", cacheRule: "positive", raw: makeRun({ id: "warm", cacheRead: 500, dropNegation: true }) }
];

describe("fresh-v3 analysis", () => {
  it("verifies eligibility, splits preservation, and keeps the default off when a gate fails", () => {
    const analysis = buildFreshV3Analysis({ controlledRuns });
    expect(analysis.fixture.path).toBe("scripts/evaluation-fixtures-fresh-v3.json");
    expect(analysis.fixture.sha256).toBe(
      "df12469c154635f1c00cebb6490e6fcacbd78dfcae584eb5c10b27ddf13c37d3"
    );
    expect(analysis.conditions.cold.verifiedEligiblePairs).toBe(21);
    expect(analysis.conditions.warm.verifiedEligiblePairs).toBe(21);
    expect(analysis.conditions.cold.mixedPairCount).toBe(0);
    expect(analysis.conditions.cold.pairedMetrics.totalTreeTokens.mean).toBeLessThan(0);
    expect(analysis.conditions.cold.pairedMetrics.rootLatencyMs.mean).toBeLessThan(0);
    expect(analysis.conditions.warm.pairedMetrics.timeToFirstTokenMs.mean).toBeLessThan(0);
    expect(analysis.deploymentMix).toMatchObject({ cold: 0.5, warm: 0.5 });
    expect(analysis.deploymentMixMetrics.totalTreeTokens.count).toBeGreaterThan(0);
    expect(analysis.deploymentMixMetrics.rootLatencyMs.count).toBeGreaterThan(0);
    expect(analysis.taskSuccess.all.pairedDelta.lower95).toBeLessThan(0);
    expect(analysis.taskSuccess.singleAgent.pairCount).toBe(30);
    expect(analysis.taskSuccess.nestedAgent.pairCount).toBe(12);
    expect(analysis.preservation.lite.userFacing.missingNegationCount).toBe(6);
    expect(analysis.preservation.lite.interAgent).toMatchObject({
      delegationMissingCount: 0,
      incompleteTreeCount: 0
    });
    expect(analysis.preservation.off.userFacing.missingNegationCount).toBe(0);
    expect(Object.keys(analysis.finalDecision.gates)).toEqual([
      "totalTreeTokenReduction",
      "latency",
      "taskSuccess",
      "preservation"
    ]);
    expect(analysis.finalDecision.gates.taskSuccess.passed).toBe(false);
    expect(analysis.finalDecision.gates.preservation.passed).toBe(false);
    expect(analysis.finalDecision.defaultMode).toBe("off");
    expect(analysis.externalModelCalls).toBe(0);
  });
});

describe("fresh-v3 tree cache eligibility", () => {
  it("excludes cold nested pairs when a child reports cache reads", () => {
    const runs = [
      {
        id: "cold",
        cacheRule: "zero",
        raw: makeRun({ id: "cold-child-warm", cacheRead: 0, childCacheRead: 40 }),
      },
      { id: "warm", cacheRule: "positive", raw: makeRun({ id: "warm", cacheRead: 500 }) },
    ];
    const analysis = buildFreshV3Analysis({ controlledRuns: runs });
    expect(analysis.conditions.cold.verifiedEligiblePairs).toBe(15);
  });
});

describe("fresh-v3 analysis default flip", () => {
  it("records lite only when all four conjunctive gates pass on clean runs", () => {
    const cleanRuns = [
      { id: "cold", cacheRule: "zero", raw: makeRun({ id: "cold-clean", cacheRead: 0 }) },
      { id: "warm", cacheRule: "positive", raw: makeRun({ id: "warm-clean", cacheRead: 500 }) }
    ];
    const analysis = buildFreshV3Analysis({ controlledRuns: cleanRuns });
    expect(Object.values(analysis.finalDecision.gates).every((gate) => gate.passed)).toBe(true);
    expect(analysis.finalDecision.defaultMode).toBe("lite");
    expect(analysis.activeOnlyFailures).toHaveLength(0);
  });
});
