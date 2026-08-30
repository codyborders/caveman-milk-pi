// Hardening slice 6: the protected group reports zero candidate injection
// by count and by provider prompt tokens, exact response hash equality with
// the normal-off product, success equality, and zero extra finalizer calls
// including setup launches.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { hashCanonicalSourceContext } from "../scripts/eval/shared-prefix-v12.mjs";

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
      id: "protected-content",
      classification: "protected",
      tasks: [
        {
          id: "p1",
          kind: "warning",
          prompt: "State the warning. Keep PRODUCTION WARNING.",
          requiredFacts: ["PRODUCTION WARNING"],
        },
      ],
    },
  ],
};

describe("shared-prefix v12 protected group hardening", () => {
  it("reports zero injection, hash equality, and zero finalizer calls including setup", async () => {
    const runner = await loadRunner();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
    const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));
    const launches = [];
    const report = await runner.runSharedPrefixV12Evaluation({
      fixtures,
      provider: "pi",
      allowPaid: true,
      model: "test-model",
      maxPaidProcesses: 100,
      repetitions: 2,
      seed: "0x1",
      workspaceRoot,
      captureDir,
      launchNode: async (request) => {
        launches.push(request);
        const cacheRead = request.phase === "measured" ? 400 : 0;
        const usage = { input: 20, output: 8, cacheRead, cacheWrite: 4 };
        return {
          text: "PRODUCTION WARNING: drop cannot be undone.",
          usage,
          usageTurns: [{ ...usage }],
          rawEvents: [],
          elapsedMs: 500,
        };
      },
    });
    const group = report.protectedGroup;
    expect(group.taskCount).toBe(1);
    expect(group.candidateInjectionCount).toBe(0);
    expect(group.providerCandidatePromptTokens).toBe(0);
    expect(group.extraFinalizerCallsIncludingSetup).toBe(0);
    expect(group.successEqual).toBe(true);
    // The protected product is byte-identical to the normal-off product.
    expect(group.responseHashEqualsNormalOff).toBe(true);
    const expectedHash = hashCanonicalSourceContext(
      "PRODUCTION WARNING: drop cannot be undone.",
    );
    expect(group.responseHashes).toEqual([expectedHash]);
    // No launch of any phase ever targeted a protected task with finalizer work.
    expect(launches.every((launch) => launch.kind !== "finalizer")).toBe(true);
  });
});
