// Workspace tools for fresh-v2 coding cases: read, write, deterministic
// tests, and explicit parent/subagent handoff messages, all isolated to a
// per-process workspace directory. Red initial failure: the extension
// module did not exist (ERR_MODULE_NOT_FOUND).

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import registerWorkspaceTools from "../scripts/eval/pi-eval-workspace.ts";

const execFileAsync = promisify(execFile);

function createRegistration() {
  const tools = new Map();
  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  };
  registerWorkspaceTools(pi);
  return tools;
}

async function withWorkspace(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-ws-test-"));
  const previous = process.env.CAVEMAN_EVAL_WORKSPACE_DIR;
  process.env.CAVEMAN_EVAL_WORKSPACE_DIR = dir;
  try {
    return await run(dir);
  } finally {
    delete process.env.CAVEMAN_EVAL_WORKSPACE_DIR;
    if (previous !== undefined) process.env.CAVEMAN_EVAL_WORKSPACE_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("workspace tools", () => {
  it("supports write, read, deterministic tests, and both handoff directions in an isolated workspace", async () => {
    const tools = createRegistration();
    expect([...tools.keys()].sort()).toEqual([
      "handoff_to_parent",
      "handoff_to_subagent",
      "workspace_read",
      "workspace_run_tests",
      "workspace_write",
    ]);

    await withWorkspace(async (dir) => {
      const write = await tools.get("workspace_write").execute("call-1", {
        path: "src/millis.ts",
        content: "export function parseMillis(v: string): number { return Number(v) * 1000; }",
      });
      expect(write.details.path).toBe("src/millis.ts");
      expect(write.details.durationMs).toEqual(expect.any(Number));
      expect(fs.readFileSync(path.join(dir, "src/millis.ts"), "utf8")).toContain("parseMillis");

      const read = await tools.get("workspace_read").execute("call-2", { path: "src/millis.ts" });
      expect(read.content[0].text).toContain("parseMillis");

      const subagent = await tools.get("handoff_to_subagent").execute("call-3", {
        message: "Fix parseMillis in src/millis.ts. Keep the public API.",
      });
      expect(subagent.details.message).toContain("src/millis.ts");

      const parent = await tools.get("handoff_to_parent").execute("call-4", {
        message: "Status: COMPLETE. Tests pass after the fix.",
      });
      expect(parent.details.message).toContain("Status: COMPLETE");

      // Deterministic seeded test script: PASS/FAIL lines, exit status.
      fs.writeFileSync(
        path.join(dir, "run-tests.mjs"),
        [
          'import { readFileSync } from "node:fs";',
          "const source = readFileSync(new URL('./src/millis.ts', import.meta.url), 'utf8');",
          'console.log(source.includes("* 1000") ? "PASS multiplies by 1000" : "FAIL multiplies by 1000");',
          'console.log("PASS parses number");',
          "process.exit(0);",
        ].join("\n"),
      );
      const passing = await tools.get("workspace_run_tests").execute("call-5", {});
      expect(passing.details).toMatchObject({ passed: 2, failed: 0, total: 2 });
      expect(passing.details.durationMs).toEqual(expect.any(Number));
      expect(passing.content[0].text).toContain("2 passed");
    });
  });

  it("reports failing tests and keeps every path inside the workspace root", async () => {
    const tools = createRegistration();
    await withWorkspace(async (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src/empty.ts"), "export const x = 1;\n");
      fs.writeFileSync(
        path.join(dir, "run-tests.mjs"),
        [
          'import { readFileSync } from "node:fs";',
          "const source = readFileSync(new URL('./src/empty.ts', import.meta.url), 'utf8');",
          'console.log(source.includes("parseMillis") ? "PASS has parseMillis" : "FAIL has parseMillis");',
          "process.exit(1);",
        ].join("\n"),
      );
      const failing = await tools.get("workspace_run_tests").execute("call-1", {});
      expect(failing.details).toMatchObject({ passed: 0, failed: 1, total: 1 });
      expect(failing.content[0].text).toContain("1 failed");

      // Path isolation: escaping the workspace root fails closed.
      const escape = await tools
        .get("workspace_read")
        .execute("call-2", { path: "../../evaluation/results/benchmark-targeted-v8.json" })
        .catch((error) => error);
      expect(escape).toBeInstanceOf(Error);
      expect(String(escape.message)).toContain("workspace");
    });
  });

  it("fails closed when the workspace environment is not configured", async () => {
    const tools = createRegistration();
    const previous = process.env.CAVEMAN_EVAL_WORKSPACE_DIR;
    delete process.env.CAVEMAN_EVAL_WORKSPACE_DIR;
    try {
      await expect(
        tools.get("workspace_write").execute("call-1", { path: "a.txt", content: "x" }),
      ).rejects.toThrow(/CAVEMAN_EVAL_WORKSPACE_DIR/);
    } finally {
      if (previous !== undefined) process.env.CAVEMAN_EVAL_WORKSPACE_DIR = previous;
    }
    void execFileAsync;
  });
});
