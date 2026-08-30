// Default process interface for the paid shared-prefix v12 path. Each node
// (child, parent, finalizer) is one real Pi CLI process in documented JSON
// mode. The canonical source context travels through
// --append-system-prompt <file>, which Pi reads byte for byte (BOM-stripped
// UTF-8), so both finalizer arms consume identical source bytes; only the
// -p finalizer prompt differs between arms.

import { spawn as nodeSpawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

export const DEFAULT_PI_BIN = path.join(
  root,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "dist",
  "bundle",
  "cli.js",
);

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

function defaultSpawn(args, options) {
  return new Promise((resolve, reject) => {
    const [command, ...commandArgs] = args;
    // JavaScript entry points must run through the current node executable
    // so the same piBin value works on every platform. Pi reads stdin to
    // EOF, so an open piped stdin would hang the child until timeout.
    const isJavaScriptEntryPoint = /\.(js|mjs|cjs)$/.test(command);
    const { timeout: spawnTimeoutMs, ...spawnOptions } = options ?? {};
    // The timeout is enforced by the manual unref'd kill timer below; the
    // built-in spawn timeout option can pin the event loop after failures.
    const child = isJavaScriptEntryPoint
      ? nodeSpawn(process.execPath, [command, ...commandArgs], { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] })
      : nodeSpawn(command, commandArgs, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] });
    // Manual kill timer, unref'd so a failed or fast launch never pins the
    // event loop for the full timeout window the way spawn's built-in
    // timeout option can.
    const killTimer =
      spawnTimeoutMs !== undefined
        ? setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // Already gone.
            }
          }, spawnTimeoutMs)
        : null;
    if (killTimer !== null) killTimer.unref();
    const clearKillTimer = () => {
      if (killTimer !== null) clearTimeout(killTimer);
    };
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearKillTimer();
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearKillTimer();
      if (code === null) {
        reject(
          new Error(
            `pi process terminated by signal ${signal ?? "unknown"} before exiting` +
              (spawnTimeoutMs !== undefined ? ` (timeout ${spawnTimeoutMs}ms)` : ""),
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

export function createDefaultLaunchNode({
  model,
  thinking = "medium",
  piBin,
  timeoutMs = 300000,
  spawnImpl = defaultSpawn,
  cwd = root,
  baseEnv = process.env,
  nowImpl = Date.now,
}) {
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("The default launch node requires a model.");
  }
  if (typeof thinking !== "string" || thinking.length === 0) {
    throw new Error("The default launch node requires a thinking mode.");
  }
  const resolvedPiBin = piBin ?? DEFAULT_PI_BIN;
  return async function launchNode(request) {
    const startedAtMs = nowImpl();
    const args = [
      resolvedPiBin,
      "--mode",
      "json",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-prompt-templates",
      "--no-session",
      ...(request.canonicalFile !== undefined
        ? ["--append-system-prompt", request.canonicalFile]
        : []),
      "--model",
      model,
      "--thinking",
      thinking,
      "-p",
      request.prompt,
    ];
    const result = await spawnImpl(args, {
      cwd: request.workspaceDir ?? cwd,
      env: baseEnv,
      timeout: timeoutMs,
    });
    if (result.code !== 0) {
      throw new Error(
        `pi process for ${request.nodeId} exited with code ${result.code}: ` +
          `${(result.stderr ?? "").substring(0, 500)}`,
      );
    }
    let text = "";
    const usageTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const usageComplete = { input: true, output: true, cacheWrite: true, cacheRead: true };
    const usageTurns = [];
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
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const message = event.message;
        text = (message.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        if (message.usage !== undefined && message.usage !== null) {
          const turnUsage = normalizeUsage(message.usage);
          usageTurns.push(turnUsage);
          for (const field of ["input", "output", "cacheWrite", "cacheRead"]) {
            if (typeof turnUsage[field] === "number") usageTotals[field] += turnUsage[field];
            else usageComplete[field] = false;
          }
        } else {
          for (const field of ["input", "output", "cacheWrite", "cacheRead"]) {
            usageComplete[field] = false;
          }
        }
      }
    }
    if (text.length === 0 && usageTurns.length === 0) {
      throw new Error(`pi process for ${request.nodeId} produced no assistant message.`);
    }
    const usage = Object.fromEntries(
      Object.entries(usageTotals).map(([field, total]) => [
        field,
        usageComplete[field] ? total : null,
      ]),
    );
    const elapsedMs = nowImpl() - startedAtMs;
    return { text, usage, usageTurns, rawEvents, elapsedMs };
  };
}
