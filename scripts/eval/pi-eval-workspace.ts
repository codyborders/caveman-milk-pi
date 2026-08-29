// Real deterministic workspace tools for fresh-v2 coding cases.
//
// The evaluator's Pi runner creates one isolated workspace directory per
// spawned process and points CAVEMAN_EVAL_WORKSPACE_DIR at it. These tools
// operate only inside that directory: reads and writes resolve against the
// root and fail closed on escape, tests execute the fixture-seeded
// run-tests.mjs with the current Node executable, and the handoff tools
// record explicit parent/subagent messages. Every tool reports its own
// measured durationMs so the runner can attribute tool time without
// guessing from outside the process.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function workspaceRoot(): string {
  const root = process.env.CAVEMAN_EVAL_WORKSPACE_DIR;
  if (typeof root !== "string" || root.length === 0) {
    throw new Error(
      "Workspace tools require CAVEMAN_EVAL_WORKSPACE_DIR to point at the isolated per-process workspace.",
    );
  }
  return root;
}

// Fail closed on any path that would escape the workspace root.
function resolveInsideWorkspace(relativePath: string): string {
  const root = workspaceRoot();
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Workspace path '${relativePath}' escapes the workspace root.`);
  }
  return resolved;
}

function now(): number {
  return Date.now();
}

type CountedTests = { passed: number; failed: number; total: number; output: string };

async function runSeededTests(): Promise<CountedTests> {
  const root = workspaceRoot();
  const testFile = path.join(root, "run-tests.mjs");
  if (!fs.existsSync(testFile)) {
    throw new Error("Workspace has no seeded run-tests.mjs to execute.");
  }
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = await execFileAsync(process.execPath, ["run-tests.mjs"], {
      cwd: root,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const typed = error as { stdout?: string; stderr?: string; code?: number };
    stdout = typed.stdout ?? "";
    stderr = typed.stderr ?? "";
    exitCode = typeof typed.code === "number" ? typed.code : 1;
  }
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const passed = lines.filter((line) => /^PASS\b/.test(line)).length;
  const failed = lines.filter((line) => /^FAIL\b/.test(line)).length;
  if (passed + failed === 0) {
    throw new Error(
      `Seeded run-tests.mjs produced no PASS/FAIL lines (exit ${exitCode}).${stderr ? ` stderr: ${stderr.substring(0, 200)}` : ""}`,
    );
  }
  return { passed, failed, total: passed + failed, output: lines.join("\n") };
}

export default function registerWorkspaceTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "workspace_read",
    label: "Read workspace file",
    description: "Read one file from the isolated evaluation workspace.",
    parameters: Type.Object({
      path: Type.String({ description: "Workspace-relative file path." }),
    }),
    async execute(_toolCallId, params) {
      const startedAt = now();
      const absolute = resolveInsideWorkspace(params.path);
      const content = fs.readFileSync(absolute, "utf8");
      return {
        content: [{ type: "text", text: content }],
        details: { path: params.path, bytes: Buffer.byteLength(content, "utf8"), durationMs: now() - startedAt },
      };
    },
  });

  pi.registerTool({
    name: "workspace_write",
    label: "Write workspace file",
    description: "Write one file inside the isolated evaluation workspace.",
    parameters: Type.Object({
      path: Type.String({ description: "Workspace-relative file path." }),
      content: Type.String({ description: "Complete file content." }),
    }),
    async execute(_toolCallId, params) {
      const startedAt = now();
      const absolute = resolveInsideWorkspace(params.path);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, params.content, "utf8");
      return {
        content: [{ type: "text", text: `Wrote ${params.path}.` }],
        details: {
          path: params.path,
          bytes: Buffer.byteLength(params.content, "utf8"),
          durationMs: now() - startedAt,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_run_tests",
    label: "Run workspace tests",
    description:
      "Run the seeded deterministic test suite (run-tests.mjs) in the isolated workspace.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params) {
      const startedAt = now();
      const result = await runSeededTests();
      const summary = `${result.passed} passed, ${result.failed} failed, ${result.total} total`;
      return {
        content: [{ type: "text", text: `${summary}\n${result.output}` }],
        details: { ...result, durationMs: now() - startedAt },
      };
    },
  });

  pi.registerTool({
    name: "handoff_to_subagent",
    label: "Hand off to subagent",
    description: "Send an explicit parent-to-subagent handoff message.",
    parameters: Type.Object({
      message: Type.String({ description: "Complete handoff message including task and constraints." }),
    }),
    async execute(_toolCallId, params) {
      const startedAt = now();
      return {
        content: [{ type: "text", text: params.message }],
        details: { direction: "parent-to-subagent", message: params.message, durationMs: now() - startedAt },
      };
    },
  });

  pi.registerTool({
    name: "handoff_to_parent",
    label: "Report back to parent",
    description: "Send an explicit subagent-to-parent handoff message.",
    parameters: Type.Object({
      message: Type.String({ description: "Complete report message including status." }),
    }),
    async execute(_toolCallId, params) {
      const startedAt = now();
      return {
        content: [{ type: "text", text: params.message }],
        details: { direction: "subagent-to-parent", message: params.message, durationMs: now() - startedAt },
      };
    },
  });
}
