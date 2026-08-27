// Child-process harness for multi-process config tests.
//
// Compiles the real src/config.ts with the repository's TypeScript compiler
// into a scratch directory, then spawns `node update-child.mjs` processes
// that import the compiled module. Children are real separate OS processes,
// so lock behavior is exercised across actual process boundaries.

import { execFileSync, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ChildRunOptions {
  /** Milliseconds the child's mutator blocks while holding the lock. */
  holdMs?: number;
  /** Legacy migration candidate passed through to updateConfigAtPath. */
  legacyConfigPath?: string;
  /** Lock options forwarded to updateConfigAtPath. */
  lockOptions?: Record<string, number>;
  /** Extra delay before the child starts its update. */
  startDelayMs?: number;
}

export interface ChildResult {
  ok: boolean;
  crashed?: boolean;
  error?: string;
  result?: unknown;
  exitCode: number | null;
}

let harnessDirectory: string | null = null;

const CHILD_SCRIPT = /* js */ `
import fs from "node:fs";
import { updateConfigAtPath } from "./config.js";

const [, , configPath, role, resultPath, optionsJson] = process.argv;
const options = JSON.parse(optionsJson);
const holdMs = options.holdMs ?? 0;
const legacyConfigPath = options.legacyConfigPath;

const block = (ms) => {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const ROLES = {
  mode: (config) => ({ ...config, mode: "full" }),
  status: (config) => ({ ...config, showStatus: false }),
  createA: (config) => ({ ...config, mode: "ultra" }),
  createB: (config) => ({ ...config, showStatus: false }),
  migA: (config) => ({ ...config, mode: "wenyan" }),
  migB: (config) => ({ ...config, showStatus: false }),
  crash: (config) => {
    block(holdMs);
    // Simulate a writer crashing mid-update: exit while holding the lock.
    process.exit(3);
  },
};

const finish = (payload) => {
  fs.writeFileSync(resultPath, JSON.stringify(payload));
};

try {
  if (options.startDelayMs > 0) block(options.startDelayMs);
  const result = await updateConfigAtPath(
    configPath,
    (config) => {
      if (role !== "crash") block(holdMs);
      return ROLES[role](config);
    },
    legacyConfigPath === undefined ? options.lockOptions : { legacyConfigPath, ...options.lockOptions },
  );
  finish({ ok: true, result });
} catch (error) {
  finish({ ok: false, error: String(error) });
  process.exitCode = 1;
}
`;

export function setupChildHarness(): string {
  if (harnessDirectory !== null) return harnessDirectory;

  const repositoryRoot = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-child-harness-"));

  execFileSync(
    path.join(repositoryRoot, "node_modules", ".bin", "tsc"),
    [
      "src/config.ts",
      "src/types.ts",
      "--ignoreConfig",
      "--types",
      "node",
      "--outDir",
      directory,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: repositoryRoot, stdio: "pipe" },
  );

  fs.writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n', "utf8");
  fs.writeFileSync(path.join(directory, "update-child.mjs"), CHILD_SCRIPT, "utf8");

  harnessDirectory = directory;
  return directory;
}

export async function runConfigChild(
  configPath: string,
  role: string,
  options: ChildRunOptions = {},
): Promise<ChildResult> {
  const directory = setupChildHarness();
  const childPath = path.join(directory, "update-child.mjs");
  const resultPath = path.join(directory, `result-${role}-${crypto.randomUUID()}.json`);

  const child = spawn(
    process.execPath,
    [childPath, configPath, role, resultPath, JSON.stringify(options)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
  });

  if (!fs.existsSync(resultPath)) {
    return { ok: false, crashed: exitCode === 3, error: stderr, exitCode };
  }
  const parsed = JSON.parse(fs.readFileSync(resultPath, "utf8")) as ChildResult;
  fs.unlinkSync(resultPath);
  return { ...parsed, exitCode };
}
