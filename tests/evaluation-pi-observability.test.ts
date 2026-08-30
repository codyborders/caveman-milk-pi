// Pi runner observability for multi-turn workspace sessions: controlled
// timing (time to first token and generation duration when the child
// reports message timestamps), per-tool durations from tool result details,
// rereads, corrective turns after failing tests, failed tests without a
// corrective turn, and normalized per-turn usage. Red initial failure: the
// runner exposed none of these fields.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const workspaceCategory = {
  id: "v2-coding-fix-bug",
  prompt: "Fix parseMillis in src/millis.ts, run the tests, then report.",
  workspace: {
    files: {
      "src/millis.ts": "export function parseMillis(v: string): number { return Number(v); }",
      "run-tests.mjs":
        'import { readFileSync } from "node:fs";\nconst s = readFileSync(new URL("./src/millis.ts", import.meta.url), "utf8");\nconsole.log(s.includes("* 1000") ? "PASS scale" : "FAIL scale");\n',
    },
  },
};

function sessionEvents() {
  return [
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "workspace_read", input: { path: "src/millis.ts" } }],
        usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 },
        timestamp: 1020,
      },
    }),
    JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "workspace_read", args: { path: "src/millis.ts" } }),
    JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "c1",
      toolName: "workspace_read",
      result: { content: [], details: { path: "src/millis.ts", durationMs: 4 } },
      isError: false,
    }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "c2", name: "workspace_read", input: { path: "src/millis.ts" } }],
        usage: { input: 20, output: 5, cacheRead: 0, cacheWrite: 0 },
        timestamp: 1040,
      },
    }),
    JSON.stringify({ type: "tool_execution_start", toolCallId: "c2", toolName: "workspace_read", args: { path: "src/millis.ts" } }),
    JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "c2",
      toolName: "workspace_read",
      result: { content: [], details: { path: "src/millis.ts", durationMs: 3 } },
      isError: false,
    }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "c3", name: "workspace_run_tests", input: {} }],
        usage: { input: 30, output: 8, cacheRead: 0, cacheWrite: 0 },
        timestamp: 1060,
      },
    }),
    JSON.stringify({ type: "tool_execution_start", toolCallId: "c3", toolName: "workspace_run_tests", args: {} }),
    JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "c3",
      toolName: "workspace_run_tests",
      result: { content: [], details: { passed: 0, failed: 1, total: 1, durationMs: 12 } },
      isError: false,
    }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Fixed the scale factor and reran the tests." }],
        usage: { input: 40, output: 12, cacheRead: 0, cacheWrite: 0 },
        timestamp: 1090,
      },
    }),
  ].join("\n");
}

describe("pi runner workspace observability", () => {
  it("measures timing, tool durations, rereads, corrective turns, and per-turn usage", async () => {
    const spawns = [];
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-ws-"));
    let clock = 1000;
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (args, options) => {
        spawns.push({
          args,
          options,
          workspaceDir: options.env.CAVEMAN_EVAL_WORKSPACE_DIR,
          seededMillis: fs.readFileSync(
            path.join(options.env.CAVEMAN_EVAL_WORKSPACE_DIR, "src/millis.ts"),
            "utf8",
          ),
          seededTests: fs.existsSync(
            path.join(options.env.CAVEMAN_EVAL_WORKSPACE_DIR, "run-tests.mjs"),
          ),
        });
        clock += 10;
        return { code: 0, stdout: sessionEvents(), stderr: "" };
      },
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
      nowImpl: () => clock,
    });

    const outcome = await runner.execute({ mode: "lite", category: workspaceCategory, repetition: 1 });

    // Workspace seeding and isolation: fresh directory per process holding
    // the seeded files, cleaned up afterwards, with the five tools enabled.
    const spawn = spawns[0];
    expect(typeof spawn.workspaceDir).toBe("string");
    expect(spawn.seededMillis).toContain("parseMillis");
    expect(spawn.seededTests).toBe(true);
    expect(spawn.args).toContain("--tools");
    const toolsFlag = spawn.args[spawn.args.indexOf("--tools") + 1];
    expect(toolsFlag.split(",").sort()).toEqual([
      "handoff_to_parent",
      "handoff_to_subagent",
      "workspace_read",
      "workspace_run_tests",
      "workspace_write",
    ]);
    expect(spawn.args).toContain(path.resolve("scripts/eval/pi-eval-workspace.ts"));
    expect(fs.existsSync(spawn.workspaceDir)).toBe(false);

    // Timing: startedAt=1000 (spawn start), first assistant timestamp 1020,
    // process end at 1010 after the +10 step inside spawn => elapsedMs is
    // measured from initial request through final response.
    expect(outcome.timing.totalElapsedMs).toBe(outcome.elapsedMs);
    expect(outcome.timing.timeToFirstTokenMs).toBe(20);
    expect(outcome.timing.generationDurationMs).toBe(outcome.elapsedMs - 20);

    // Tool metrics: three calls, durations from result details, one reread
    // of src/millis.ts, failing tests followed by a corrective turn.
    expect(outcome.toolMetrics.toolCalls).toBe(3);
    expect(outcome.toolMetrics.toolDurationMs).toEqual([4, 3, 12]);
    expect(outcome.toolMetrics.rereads).toBe(1);
    expect(outcome.toolMetrics.correctiveTurns).toBe(1);
    expect(outcome.toolMetrics.failedTestsWithoutCorrectiveTurn).toBe(false);
    expect(outcome.toolMetrics.retries).toBeNull();

    // Normalized per-turn usage plus totals across every assistant turn.
    expect(outcome.usageTurns).toEqual([
      { input: 100, output: 10, cacheWrite: 0, cacheRead: 0 },
      { input: 20, output: 5, cacheWrite: 0, cacheRead: 0 },
      { input: 30, output: 8, cacheWrite: 0, cacheRead: 0 },
      { input: 40, output: 12, cacheWrite: 0, cacheRead: 0 },
    ]);
    expect(outcome.usage).toEqual({ input: 190, output: 35, cacheWrite: 0, cacheRead: 0 });
    expect(outcome.sessionToolMetrics).toMatchObject({
      testsRun: 1,
      failedTestsWithoutCorrectiveTurn: false,
    });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });

  it("flags failing tests that never receive a corrective turn", async () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-ws2-"));
    const events = [
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "c1", name: "workspace_run_tests", input: {} }],
          usage: { input: 10, output: 4 },
        },
      }),
      JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "workspace_run_tests", args: {} }),
      JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "c1",
        toolName: "workspace_run_tests",
        result: { content: [], details: { passed: 0, failed: 2, total: 2, durationMs: 9 } },
        isError: false,
      }),
    ].join("\n");
    const runner = evaluate.createPiRunner({
      piBin: "/opt/pi/bin/pi",
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async () => ({ code: 0, stdout: events, stderr: "" }),
      mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
    });
    const outcome = await runner.execute({ mode: "off", category: workspaceCategory, repetition: 1 });
    expect(outcome.sessionToolMetrics.testsRun).toBe(1);
    expect(outcome.sessionToolMetrics.failedTestsWithoutCorrectiveTurn).toBe(true);
    expect(outcome.toolMetrics.correctiveTurns).toBe(0);
    expect(outcome.timing.timeToFirstTokenMs).toBeNull();
    expect(outcome.timing.generationDurationMs).toBeNull();
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
});
