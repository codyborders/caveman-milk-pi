import { describe, expect, it, vi } from "vitest";
import { createPiRunner, runProviderEvaluation } from "../scripts/evaluate.mjs";

function assistantEvent(text: string, input: number, output: number, timestamp: number): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      usage: { input, output, cacheRead: 0, cacheWrite: 0 },
      timestamp,
    },
  });
}

describe("selective-final v11 Pi runner", () => {
  it("runs normal work off, then one tool-free candidate finalizer", async () => {
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
    const spawnImpl = vi.fn(async (args: string[], options: { env: NodeJS.ProcessEnv }) => {
      calls.push({ args, env: options.env });
      const finalizer = calls.length === 2;
      return {
        code: 0,
        stderr: "",
        stdout: `${assistantEvent(finalizer ? "final answer" : "complete draft", finalizer ? 7 : 10, finalizer ? 3 : 4, finalizer ? 31 : 11)}\n`,
      };
    });
    const times = [0, 20, 20, 35];
    const runner = createPiRunner({
      piBin: "pi.mjs",
      extensionPath: "/extension.ts",
      finalResponseExtensionPath: "/final-response.ts",
      selectiveFinal: true,
      model: "test/model",
      spawnImpl,
      nowImpl: () => times.shift() ?? 35,
    });

    const result = await runner.execute({
      mode: "selective-final-v11",
      category: { id: "direct", prompt: "Do the task." },
      repetition: 1,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].env.CAVEMAN_EVAL_FINAL_ARM).toBeUndefined();
    expect(calls[1].env.CAVEMAN_EVAL_FINAL_ARM).toBe("selective-final-v11");
    expect(calls[1].args).toContain("--no-tools");
    expect(calls[1].args).toContain("/final-response.ts");
    expect(calls[1].args.at(-1)).toContain("complete draft");
    expect(result.text).toBe("final answer");
    expect(result.baseResponse).toBe("complete draft");
    expect(result.finalizer).toMatchObject({
      mode: "off",
      arm: "selective-final-v11",
      injectedCandidateNodes: 1,
      tools: [],
      usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0 },
    });
    expect(result.elapsedMs).toBe(35);
    expect(result.baseElapsedMs).toBe(20);
  });

  it("persists finalizer records and reserves both direct processes", async () => {
    const spawns: string[][] = [];
    const report = await runProviderEvaluation({
      provider: "pi",
      allowPaid: true,
      model: "test/model",
      maxPaidCalls: 12,
      repetitions: 3,
      seed: "19",
      pairOrderStrategy: "alternating",
      fixtures: {
        version: 7,
        fixtureSet: "fresh-v4",
        fixtureHash: "test-fixture",
        modes: ["off", "selective-final-v11"],
        runtimePrompts: { off: "", "selective-final-v11": "" },
        categories: [
          {
            id: "direct",
            taskClass: "factual",
            prompt: "Return the exact word complete.",
            requirements: [],
            compressionPolicy: { eligible: false, reason: "test" },
          },
        ],
      },
      spawnImpl: async (args: string[]) => {
        spawns.push(args);
        return {
          code: 0,
          stderr: "",
          stdout: `${assistantEvent(spawns.length % 2 === 0 ? "complete" : "draft complete", 10, 2, Date.now())}\n`,
        };
      },
      commitOverride: "0123456789abcdef0123456789abcdef01234567",
      readPiVersion: () => "0.84.3",
      execGit: () => "0123456789abcdef0123456789abcdef01234567",
    });

    expect(spawns).toHaveLength(12);
    expect(report.results).toHaveLength(6);
    expect(report.results.every((result) => result.finalizer !== null)).toBe(true);
    expect(
      report.results.map((result) => result.finalizer.injectedCandidateNodes).sort(),
    ).toEqual([0, 0, 0, 1, 1, 1]);
    expect(report.paidCallAccounting.actual.provider).toBe(12);
    expect(
      report.cacheVerification.pairs.every(
        (pair) => pair.offNodeCacheReads.length === 2 && pair.activeNodeCacheReads.length === 2,
      ),
    ).toBe(true);
  });
});
