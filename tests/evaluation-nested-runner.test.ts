// Runner wiring for nested categories: the parent Pi process loads the
// nested extension with mirrored model, thinking, mode, and extension paths,
// and the session outcome records the complete tree with per-node usage, tree
// totals, and the retained raw parent event stream.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const nestedCategory = {
  id: "v3-nested-fix",
  prompt: "Delegate the fix, verify it, then report.",
  nested: true,
  workspace: {
    files: {
      "src/delay.ts": "export function parseDelay(v: string): number { return Number(v); }",
      "run-tests.mjs": "console.log('PASS delay');",
    },
  },
};

const childDetails = {
  nodeId: "child-1",
  parentId: "root",
  task: "Fix parseDelay in src/delay.ts. Run the tests.",
  responseText: "Fixed parseDelay. All 1 workspace tests pass.",
  childLatencyMs: 4000,
  timing: { timeToFirstTokenMs: 300, generationDurationMs: 3700 },
  usage: { input: 230, output: 30, cacheWrite: 6, cacheRead: 60 },
  assistantTurns: 2,
  clarificationTurns: 1,
  toolCalls: [{ name: "workspace_run_tests", input: {} }],
  toolCallCount: 1,
  sessionToolMetrics: { testsRun: 1, passingTestRuns: 1, finalTestRunPassed: true, correctiveTurns: 0, clarificationTurns: 1, rereads: null },
  rawEvents: ["{\"type\":\"message_end\"}"],
};

function parentEvents() {
  return [
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Should the child inspect the current implementation?" },
          { type: "tool_use", id: "p1", name: "delegate_eval_child", input: { task: "Fix parseDelay in src/delay.ts. Run the tests." } },
        ],
        usage: { input: 200, output: 25, cacheRead: 0, cacheWrite: 8 },
        timestamp: 1100,
      },
    }),
    JSON.stringify({ type: "tool_execution_start", toolCallId: "p1", toolName: "delegate_eval_child", args: { task: "Fix parseDelay in src/delay.ts. Run the tests." } }),
    JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "p1",
      toolName: "delegate_eval_child",
      result: { content: [{ type: "text", text: "Fixed parseDelay. All 1 workspace tests pass." }], details: childDetails },
      isError: false,
    }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Child verified. All 1 workspace tests pass." }],
        usage: { input: 260, output: 12, cacheRead: 40, cacheWrite: 2 },
        timestamp: 6200,
      },
    }),
  ].join("\n");
}

describe("pi runner nested wiring", () => {
  it("mirrors child configuration and records the complete tree with retained raw events", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-nested-"));
    const spawns = [];
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      thinkingLevel: "low",
      cachePromptStrategy: "shared",
      spawnImpl: async (args, options) => {
        spawns.push({ args, options });
        return { code: 0, stdout: parentEvents(), stderr: "" };
      },
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      nowImpl: (() => { let t = 1000; return () => (t += 100); })(),
    });

    const outcome = await runner.execute({ mode: "lite", category: nestedCategory, repetition: 1 });

    const spawn = spawns[0];
    const flags = spawn.args.slice(1);
    const extensions = flags.filter((_value, index) => flags[index - 1] === "-e");
    expect(extensions).toHaveLength(4);
    expect(extensions[2]).toContain("pi-eval-nested.ts");
    expect(extensions[3]).toContain("pi-eval-cache-control.ts");
    expect(flags[flags.indexOf("--tools") + 1].split(",")).toContain("delegate_eval_child");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_PI_BIN).toBe("/opt/pi/bin/pi");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_MODEL).toBe("test-model");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_THINKING).toBe("low");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_MODE).toBe("lite");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_CAVEMAN_EXTENSION).toBe("/repo/index.ts");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_WORKSPACE_EXTENSION).toContain("pi-eval-workspace.ts");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_CACHE_EXTENSION).toContain("pi-eval-cache-control.ts");
    expect(spawn.options.env.CAVEMAN_EVAL_NESTED_CACHE_NONCE).toBe("shared-warm-v1");
    expect(typeof spawn.options.env.CAVEMAN_EVAL_WORKSPACE_DIR).toBe("string");

    expect(outcome.nested).not.toBeNull();
    expect(outcome.nested.rootNodeId).toBe("root");
    expect(outcome.nested.complete).toBe(true);
    expect(outcome.nested.children).toHaveLength(1);
    expect(outcome.nested.children[0]).toMatchObject({
      nodeId: "child-1",
      parentId: "root",
      mode: "lite",
      childLatencyMs: 4000,
      usage: { input: 230, output: 30, cacheWrite: 6, cacheRead: 60 },
      responseText: "Fixed parseDelay. All 1 workspace tests pass.",
      clarificationTurns: 1,
    });
    expect(outcome.sessionToolMetrics.clarificationTurns).toBe(1);
    // Root billed 460 input, 37 output, 10 cache write, 40 cache read. The
    // child billed its own 230 input, 30 output, 6 write, 60 read. Tree
    // totals sum each node once with no double counting.
    expect(outcome.nested.treeTotals).toEqual({ input: 690, output: 67, cacheWrite: 16, cacheRead: 100 });
    expect(outcome.nested.rawParentEvents).toHaveLength(4);
    expect(outcome.nested.rawParentEvents[0]).toContain("delegate_eval_child");
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
});

describe("pi provider nested reporting", () => {
  it("retains nested trees on results and passes nested-delegation validation", async () => {
    const report = await evaluate.runProviderEvaluation({
      apiKey: undefined,
      model: "test-model",
      allowPaid: true,
      provider: "pi",
      endpoint: "unused://endpoint",
      repetitions: 3,
      seed: "0xa1b2c3d4",
      execGit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      readPiVersion: () => "0.84.3",
      spawnImpl: async () => ({ code: 0, stdout: parentEvents(), stderr: "" }),
      fixtures: {
        version: 6,
        fixtureSet: "fresh-v3-test",
        fixtureHash: "deadbeef",
        modes: ["off", "lite"],
        categories: [
          {
            ...nestedCategory,
            compressionPolicy: { eligible: false, reason: "nested coding task" },
            requirements: [
              {
                id: "delegation",
                kind: "nested-delegation",
                toolName: "delegate_eval_child",
                requiredTerms: ["Fix parseDelay in src/delay.ts"],
                hardGroup: "contract",
                protected: true,
              },
            ],
          },
        ],
        promptContract: { commonRules: "", modeRules: { lite: "" } },
        runtimePrompts: { off: "", lite: "" },
      },
    });

    expect(report.caseCount).toBe(6);
    expect(report.plannedProviderCalls).toBe(12);
    expect(report.paidCallAccounting.actual.provider).toBe(12);
    expect(report.paidCallAccounting.actual.parentProvider).toBe(6);
    expect(report.paidCallAccounting.actual.childProvider).toBe(6);
    expect(report.results.every((result) => result.nested !== null)).toBe(true);
    expect(report.results.every((result) => result.nested.complete === true)).toBe(true);
    expect(report.results.every((result) => result.nested.treeTotals.input === 690)).toBe(true);
    expect(report.results.every((result) => result.behavioralPassed === true)).toBe(true);
    expect(report.results.every((result) => result.validation.groups.contractPass === true)).toBe(true);
  });
});
