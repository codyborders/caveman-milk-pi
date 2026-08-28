// Pi CLI environment tests verify that public controls reach the real command entry point without provider traffic.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Pi CLI evaluation controls", () => {
  it("uses configured seed, checkpoint, cap, commit, and Pi executable", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-cli-pi-"));
    const fakePi = path.join(directory, "fake-pi.mjs");
    const checkpoint = path.join(directory, "checkpoint.json");
    fs.writeFileSync(
      fakePi,
      `#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
const config = JSON.parse(
  fs.readFileSync(path.join(process.env.CAVEMAN_MILK_CONFIG_DIR, "caveman-milk-pi.json"), "utf8"),
);
const active = config.mode !== "off";
process.stdout.write(JSON.stringify({
  type: "message_end",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "cache_key identity" }],
    usage: { input: 50, output: active ? 20 : 40, cacheRead: 10, cacheWrite: 5 },
  },
}) + "\\n");
`,
      { encoding: "utf8", mode: 0o700 },
    );

    const output = execFileSync("node", [path.resolve("scripts/evaluate.mjs")], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        CAVEMAN_EVAL_PROVIDER: "pi",
        CAVEMAN_EVAL_ALLOW_PAID: "1",
        CAVEMAN_EVAL_MODEL: "test-model",
        CAVEMAN_EVAL_MODES: "off,full",
        CAVEMAN_EVAL_CATEGORIES: "technical-explanation",
        CAVEMAN_EVAL_REPETITIONS: "3",
        CAVEMAN_EVAL_SEED: "0x1234abcd",
        CAVEMAN_EVAL_MAX_PAID_CALLS: "6",
        CAVEMAN_EVAL_CHECKPOINT: checkpoint,
        CAVEMAN_EVAL_COMMIT: "abc123",
        CAVEMAN_EVAL_PI_BIN: fakePi,
        CAVEMAN_EVAL_TIMEOUT_MS: "5000",
        CAVEMAN_EVAL_MAX_ATTEMPTS: "2",
      },
    });
    const report = JSON.parse(output);

    expect(report.provider).toBe("pi");
    expect(report.seed).toBe("0x1234abcd");
    expect(report.environment.commit).toBe("abc123");
    expect(report.caseCount).toBe(6);
    expect(fs.existsSync(checkpoint)).toBe(true);
  }, 30_000);
});
