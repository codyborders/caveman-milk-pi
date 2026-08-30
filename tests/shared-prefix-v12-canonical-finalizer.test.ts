// Hardening slice 1: finalizer arms must consume the canonical text file as
// their system context, with bytes and hash verified before every launch. A
// drift between the locked hash and the file on disk must stop the run
// before the next finalizer launch.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

async function loadRunner() {
  try {
    return await import("../scripts/eval/shared-prefix-v12-runner.mjs");
  } catch {
    return null;
  }
}

const fixtures = {
  version: 12,
  groups: [
    {
      id: "eligible-prose",
      classification: "eligible",
      tasks: [
        {
          id: "t1",
          kind: "comparison",
          prompt: "Compare. Cover throughput.",
          requiredFacts: ["throughput"],
          childTasks: ["c1"],
        },
      ],
    },
  ],
};

function outcome(cacheRead) {
  return {
    text: "covers throughput",
    usage: { input: 20, output: 8, cacheRead, cacheWrite: 4 },
    usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
    rawEvents: [],
    elapsedMs: 500,
  };
}

async function runReport(launchNode, overrides = {}) {
  const runner = await loadRunner();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));
  return runner.runSharedPrefixV12Evaluation({
    fixtures,
    provider: "pi",
    allowPaid: true,
    model: "test-model",
    maxPaidProcesses: 100,
    repetitions: 2,
    seed: "0x1",
    workspaceRoot,
    captureDir,
    launchNode,
    ...overrides,
  });
}

describe("shared-prefix v12 canonical finalizer context", () => {
  it("launches finalizers against the canonical text file and rejects hash drift", async () => {
    const finalizerFiles = [];
    let tampered = false;
    await expect(
      runReport(async (request) => {
        if (request.kind === "finalizer") {
          finalizerFiles.push(request.canonicalFile);
          if (
            !tampered &&
            request.arm === "shared-prefix-off" &&
            request.nodeId.includes("rep1")
          ) {
            // Corrupt the canonical context between measured launches.
            fs.writeFileSync(request.canonicalFile, "tampered canonical bytes", "utf8");
            tampered = true;
          }
        }
        return outcome(request.kind === "finalizer" ? 400 : 0);
      }),
    ).rejects.toThrow(/mismatch/i);
    expect(finalizerFiles.length).toBeGreaterThanOrEqual(1);
    expect(
      finalizerFiles.every((file) => String(file).endsWith(".canonical.txt")),
      "finalizers must consume the canonical text file, not the JSON lock",
    ).toBe(true);
  });
});
