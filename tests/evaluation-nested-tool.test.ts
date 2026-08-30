// Nested evaluation delegation tool: a parent Pi process calls
// delegate_eval_child, which spawns a real child Pi process with the same
// model, thinking level, caveman mode, repository extension, isolated config,
// and shared workspace. The tool returns the child response with node
// linkage, timing, usage, and raw child events.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createNestedEvalExtension } from "../scripts/eval/pi-eval-nested.ts";

const childEvents = [
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Should I inspect the file first?" },
        { type: "tool_use", id: "c1", name: "workspace_read", input: { path: "src/delay.ts" } },
      ],
      usage: { input: 90, output: 12, cacheRead: 0, cacheWrite: 4 },
      timestamp: 1600,
    },
  }),
  JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "workspace_read", args: { path: "src/delay.ts" } }),
  JSON.stringify({
    type: "tool_execution_end",
    toolCallId: "c1",
    toolName: "workspace_read",
    result: { content: [], details: { path: "src/delay.ts", durationMs: 3 } },
  }),
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Fixed parseDelay in src/delay.ts. All 2 workspace tests pass." }],
      usage: { input: 140, output: 18, cacheRead: 60, cacheWrite: 2 },
      timestamp: 1900,
    },
  }),
].join("\n");

function createRegistration(overrides = {}) {
  const tools = new Map();
  const spawns = [];
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-nested-test-"));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-nested-ws-"));
  const env = {
    CAVEMAN_EVAL_NESTED_PI_BIN: "/opt/pi/bin/pi",
    CAVEMAN_EVAL_NESTED_MODEL: "test-model",
    CAVEMAN_EVAL_NESTED_THINKING: "medium",
    CAVEMAN_EVAL_NESTED_MODE: "lite",
    CAVEMAN_EVAL_NESTED_CAVEMAN_EXTENSION: "/repo/index.ts",
    CAVEMAN_EVAL_NESTED_WORKSPACE_EXTENSION: "/repo/scripts/eval/pi-eval-workspace.ts",
    CAVEMAN_EVAL_WORKSPACE_DIR: workspaceDir,
    ...overrides.env,
  };
  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  };
  createNestedEvalExtension(pi, {
    env,
    spawnImpl: async (args, options) => {
      spawns.push({ args, options });
      return { code: 0, stdout: childEvents, stderr: "" };
    },
    mkdtempImpl: (prefix) => fs.mkdtempSync(path.join(homeRoot, prefix)),
    nowImpl: (() => { let t = 1000; return () => (t += 500); })(),
    ...overrides.deps,
  });
  return { tools, spawns, homeRoot, workspaceDir };
}

describe("nested evaluation delegation tool", () => {
  it("spawns an isolated same-config child and returns its response with node linkage and raw events", async () => {
    const { tools, spawns, homeRoot } = createRegistration();
    expect([...tools.keys()]).toContain("delegate_eval_child");

    const result = await tools.get("delegate_eval_child").execute("call-1", {
      task: "Fix parseDelay in src/delay.ts. Run the tests. Do not rename parseDelay.",
    });

    const spawn = spawns[0];
    expect(spawn.args[0]).toBe("/opt/pi/bin/pi");
    const flags = spawn.args.slice(1);
    expect(flags).toContain("--mode");
    expect(flags[flags.indexOf("--mode") + 1]).toBe("json");
    expect(flags[flags.indexOf("--model") + 1]).toBe("test-model");
    expect(flags[flags.indexOf("--thinking") + 1]).toBe("medium");
    expect(flags[flags.indexOf("-p") + 1]).toBe(
      "Fix parseDelay in src/delay.ts. Run the tests. Do not rename parseDelay.",
    );
    const extensions = flags.filter((_value, index) => flags[index - 1] === "-e");
    expect(extensions).toEqual(["/repo/index.ts", "/repo/scripts/eval/pi-eval-workspace.ts"]);
    const toolsFlag = flags[flags.indexOf("--tools") + 1].split(",").sort();
    expect(toolsFlag).toEqual(["workspace_read", "workspace_run_tests", "workspace_write"]);

    const childConfigDir = spawn.options.env.CAVEMAN_MILK_CONFIG_DIR;
    expect(childConfigDir.length).toBeGreaterThan(0);
    expect(spawn.options.env.CAVEMAN_EVAL_WORKSPACE_DIR).toBeDefined();

    expect(result.content[0].text).toBe("Fixed parseDelay in src/delay.ts. All 2 workspace tests pass.");
    expect(result.details).toMatchObject({
      nodeId: "child-1",
      parentId: "root",
      responseText: "Fixed parseDelay in src/delay.ts. All 2 workspace tests pass.",
      childLatencyMs: expect.any(Number),
      usage: { input: 230, output: 30, cacheWrite: 6, cacheRead: 60 },
      assistantTurns: 2,
      clarificationTurns: 1,
      toolCallCount: 1,
    });
    expect(result.details.timing.timeToFirstTokenMs).toBe(100);
    expect(result.details.rawEvents).toHaveLength(4);
    expect(result.details.rawEvents[0]).toContain("workspace_read");
    expect(fs.existsSync(childConfigDir)).toBe(false);
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
});
