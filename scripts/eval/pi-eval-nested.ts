// Real nested evaluation path. The parent Pi process exposes one delegation
// tool. Calling it spawns a real child Pi process with the identical
// configured model, thinking level, caveman mode, repository caveman
// extension, an isolated config directory, and the shared evaluation
// workspace. The child response travels back through the tool result, along
// with node linkage, per-node usage, timing, and the raw child event stream.
// Nothing about the child response is deterministic or canned.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";

export const NESTED_DELEGATION_TOOL_NAME = "delegate_eval_child";
export const NESTED_ROOT_NODE_ID = "root";

const CHILD_TOOLS = ["workspace_read", "workspace_write", "workspace_run_tests"];

interface SpawnOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

export interface NestedEvalDeps {
  spawnImpl?: (args: string[], options: unknown) => Promise<SpawnOutcome>;
  mkdtempImpl?: (prefix: string) => string;
  nowImpl?: () => number;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

function defaultSpawn(args: string[], options): Promise<SpawnOutcome> {
  return new Promise((resolve, reject) => {
    const [command, ...commandArgs] = args;
    const isJavaScriptEntryPoint = /\.(js|mjs|cjs)$/.test(command);
    // Pi reads stdin to EOF before acting, so an open piped stdin would hang
    // the child until the timeout. Ignore stdin instead.
    const stdio = ["ignore", "pipe", "pipe"];
    const child = isJavaScriptEntryPoint
      ? spawn(process.execPath, [command, ...commandArgs], { ...options, stdio })
      : spawn(command, commandArgs, { ...options, stdio });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === null) {
        const timeoutNote =
          options?.timeout !== undefined ? ` (spawn timeout ${options.timeout}ms)` : "";
        reject(
          new Error(
            `nested child terminated by signal ${signal ?? "unknown"} before exiting${timeoutNote}`,
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function normalizeUsage(usage) {
  if (usage === null || typeof usage !== "object") {
    return { input: null, output: null, cacheWrite: null, cacheRead: null };
  }
  const pick = (...keys) => {
    for (const key of keys) {
      if (typeof usage[key] === "number") return usage[key];
    }
    return null;
  };
  return {
    input: pick("input_tokens", "input"),
    output: pick("output_tokens", "output"),
    cacheWrite: pick("cache_creation_input_tokens", "cacheWrite", "cache_write"),
    cacheRead: pick("cache_read_input_tokens", "cacheRead", "cache_read"),
  };
}

function requiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Nested evaluation requires ${name} to point at the runner-provided child configuration.`,
    );
  }
  return value;
}

export function createNestedEvalExtension(pi: ExtensionAPI, deps: NestedEvalDeps = {}): void {
  const env = deps.env ?? process.env;
  const spawnImpl = deps.spawnImpl ?? defaultSpawn;
  const mkdtempImpl = deps.mkdtempImpl ?? ((prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const nowImpl = deps.nowImpl ?? Date.now;
  const timeoutMs =
    deps.timeoutMs ??
    (typeof env.CAVEMAN_EVAL_NESTED_TIMEOUT_MS === "string" &&
    env.CAVEMAN_EVAL_NESTED_TIMEOUT_MS.length > 0
      ? Number(env.CAVEMAN_EVAL_NESTED_TIMEOUT_MS)
      : 180000);
  let childCounter = 0;

  pi.registerTool({
    name: NESTED_DELEGATION_TOOL_NAME,
    label: "Delegate evaluation task to child Pi",
    description:
      "Spawn one child Pi process with the same model, thinking level, caveman mode, and shared workspace. Pass a complete child task message. The child final response returns through this tool.",
    parameters: Type.Object({
      task: Type.String({ description: "Complete child task message including goal, files, and constraints." }),
    }),
    async execute(_toolCallId, params) {
      const piBin = requiredEnv(env, "CAVEMAN_EVAL_NESTED_PI_BIN");
      const model = requiredEnv(env, "CAVEMAN_EVAL_NESTED_MODEL");
      const mode = requiredEnv(env, "CAVEMAN_EVAL_NESTED_MODE");
      const cavemanExtension = requiredEnv(env, "CAVEMAN_EVAL_NESTED_CAVEMAN_EXTENSION");
      const workspaceExtension = requiredEnv(env, "CAVEMAN_EVAL_NESTED_WORKSPACE_EXTENSION");
      const workspaceDir = requiredEnv(env, "CAVEMAN_EVAL_WORKSPACE_DIR");
      const thinkingLevel = env.CAVEMAN_EVAL_NESTED_THINKING;
      const cacheExtension = env.CAVEMAN_EVAL_NESTED_CACHE_EXTENSION;
      const cacheNonce = env.CAVEMAN_EVAL_NESTED_CACHE_NONCE;

      childCounter += 1;
      const nodeId = `child-${childCounter}`;
      // Isolated child config: fresh directory, same mode as the parent.
      const childConfigDir = mkdtempImpl("caveman-pi-child-config-");
      fs.writeFileSync(
        path.join(childConfigDir, "caveman-milk-pi.json"),
        JSON.stringify({ schemaVersion: 1, mode, showStatus: false }, null, 2) + "\n",
        { mode: 0o600 },
      );

      try {
        const args = [
          piBin,
          "--mode",
          "json",
          "--no-extensions",
          "--no-skills",
          "--no-context-files",
          "--no-prompt-templates",
          "--tools",
          CHILD_TOOLS.join(","),
          "-e",
          cavemanExtension,
          "-e",
          workspaceExtension,
          ...(typeof cacheExtension === "string" && cacheExtension.length > 0
            ? ["-e", cacheExtension]
            : []),
          "--model",
          model,
          ...(typeof thinkingLevel === "string" && thinkingLevel.length > 0
            ? ["--thinking", thinkingLevel]
            : []),
          "-p",
          params.task,
        ];
        const startedAtMs = nowImpl();
        const result = await spawnImpl(args, {
          env: {
            ...env,
            CAVEMAN_MILK_CONFIG_DIR: childConfigDir,
            CAVEMAN_EVAL_WORKSPACE_DIR: workspaceDir,
            ...(typeof cacheNonce === "string" && cacheNonce.length > 0
              ? { CAVEMAN_EVAL_CACHE_NONCE: cacheNonce }
              : {}),
          },
          timeout: timeoutMs,
        });
        const elapsedMs = nowImpl() - startedAtMs;
        if (result.code !== 0) {
          throw new Error(
            `nested child exited with code ${result.code}: ${(result.stderr ?? "").substring(0, 500)}`,
          );
        }

        let text = "";
        let assistantTurns = 0;
        let firstAssistantTimestampMs = null;
        let sawUsage = false;
        const usageTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
        const usageComplete = { input: true, output: true, cacheWrite: true, cacheRead: true };
        const toolCalls = [];
        const readPaths = new Map();
        let rereads = 0;
        let testsRun = 0;
        let passingTestRuns = 0;
        let finalTestRunPassed = null;
        let failingTestEndSeen = false;
        let correctiveTurns = 0;
        let clarificationTurns = 0;
        const rawEvents = [];
        for (const line of (result.stdout ?? "").split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          rawEvents.push(trimmed);
          let event;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (event.type === "tool_execution_start") {
            toolCalls.push({ name: event.toolName, input: event.args });
            if (event.toolName === "workspace_read") {
              const readPath = String(event.args?.path ?? "");
              if (readPaths.has(readPath)) rereads += 1;
              else readPaths.set(readPath, true);
            }
          }
          if (event.type === "tool_execution_end" && event.toolName === "workspace_run_tests") {
            const failed = Number(event.result?.details?.failed);
            testsRun += 1;
            if (Number.isFinite(failed) && failed > 0) {
              finalTestRunPassed = false;
              failingTestEndSeen = true;
            } else if (failed === 0) {
              passingTestRuns += 1;
              finalTestRunPassed = true;
            } else {
              finalTestRunPassed = null;
            }
          }
          if (event.type === "message_end" && event.message?.role === "assistant") {
            const message = event.message;
            assistantTurns += 1;
            const turnText = (message.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("");
            if (turnText.includes("?")) clarificationTurns += 1;
            if (failingTestEndSeen) {
              correctiveTurns += 1;
              failingTestEndSeen = false;
            }
            const timestamp = message.timestamp;
            if (
              firstAssistantTimestampMs === null &&
              typeof timestamp === "number" &&
              Number.isFinite(timestamp) &&
              timestamp >= startedAtMs
            ) {
              firstAssistantTimestampMs = timestamp;
            }
            text = (message.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("");
            if (message.usage !== undefined && message.usage !== null) {
              sawUsage = true;
              const turnUsage = normalizeUsage(message.usage);
              for (const field of ["input", "output", "cacheWrite", "cacheRead"]) {
                if (typeof turnUsage[field] === "number") {
                  usageTotals[field] += turnUsage[field];
                } else {
                  usageComplete[field] = false;
                }
              }
            } else {
              for (const field of ["input", "output", "cacheWrite", "cacheRead"]) {
                usageComplete[field] = false;
              }
            }
          }
        }
        if (text.length === 0 && toolCalls.length === 0) {
          throw new Error(
            "nested child produced no assistant text or tool call for the delegated task.",
          );
        }
        const usage = sawUsage
          ? Object.fromEntries(
              Object.entries(usageTotals).map(([field, total]) => [
                field,
                usageComplete[field] ? total : null,
              ]),
            )
          : { input: null, output: null, cacheWrite: null, cacheRead: null };
        const timeToFirstTokenMs =
          firstAssistantTimestampMs === null ? null : firstAssistantTimestampMs - startedAtMs;
        return {
          content: [{ type: "text", text }],
          details: {
            nodeId,
            parentId: NESTED_ROOT_NODE_ID,
            task: params.task,
            responseText: text,
            childLatencyMs: elapsedMs,
            timing: {
              timeToFirstTokenMs,
              generationDurationMs: timeToFirstTokenMs === null ? null : elapsedMs - timeToFirstTokenMs,
            },
            usage,
            assistantTurns,
            clarificationTurns,
            toolCalls,
            toolCallCount: toolCalls.length,
            sessionToolMetrics: {
              testsRun,
              passingTestRuns,
              finalTestRunPassed,
              correctiveTurns,
              rereads: readPaths.size === 0 ? null : rereads,
            },
            rawEvents,
          },
        };
      } finally {
        try {
          fs.rmSync(childConfigDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup of the isolated child config directory.
        }
      }
    },
  });
}

export default function nestedEvalExtension(pi: ExtensionAPI): void {
  createNestedEvalExtension(pi);
}
