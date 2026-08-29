// Pricing gate: a cost or release gate makes structured pricing a paid-process
// boundary. Missing or malformed tables must reject before buildPlan, before
// checkpoint creation, before count traffic, and before any provider call.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer, fixtures } from "./helpers/mock-provider-server.js";

function spyFetch() {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("provider execution must not happen during pricing gate rejection");
  };
  return { fetchImpl, calls: () => calls };
}

function validTable() {
  return {
    schemaVersion: 1,
    models: {
      "test-model": {
        source: "vendor pricing page, verified 2026-08-29",
        effectiveDate: "2026-08-29",
        inputPerMTok: 3,
        cacheWritePerMTok: 3.75,
        cacheReadPerMTok: 0.3,
        outputPerMTok: 15,
      },
    },
  };
}

describe("pricing gate preflight", () => {
  it("rejects a cost gate without pricing before any provider execution or checkpoint creation", async () => {
    const { fetchImpl, calls } = spyFetch();
    const checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-gate-"));
    const checkpointPath = path.join(checkpointDir, "checkpoint.json");
    try {
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions("http://gate.invalid/v1/messages", {
            fetchImpl,
            gate: "cost",
            checkpointPath,
          }),
        ),
      ).rejects.toThrow(/CAVEMAN_EVAL_PRICING/);
      expect(calls()).toBe(0);
      expect(fs.existsSync(checkpointPath)).toBe(false);
    } finally {
      fs.rmSync(checkpointDir, { recursive: true, force: true });
    }
  });

  it("rejects a gated pricing table with the wrong schema version before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "release",
          pricing: { ...validTable(), schemaVersion: 2 },
        }),
      ),
    ).rejects.toThrow(/schemaVersion 1/);
    expect(calls()).toBe(0);
  });

  it("rejects a gated pricing object without a models table before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1 },
        }),
      ),
    ).rejects.toThrow(/models table/);
    expect(calls()).toBe(0);
  });

  it("rejects a gated table missing the primary or judge model before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "cost",
          pricing: { ...validTable(), models: { "other-model": Object.values(validTable().models)[0] } },
        }),
      ),
    ).rejects.toThrow(/missing entries for required model\(s\): test-model/);
    const judgeSpy = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl: judgeSpy.fetchImpl,
          gate: "cost",
          pricing: validTable(),
          judge: true,
          judgeModel: "judge-model",
        }),
      ),
    ).rejects.toThrow(/missing entries for required model\(s\): .*judge-model/);
    expect(calls()).toBe(0);
    expect(judgeSpy.calls()).toBe(0);
  });

  it("rejects a gated pricing entry whose four rates are all zero before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    const zeroEntry = Object.assign(Object.values(validTable().models)[0], {
      inputPerMTok: 0,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
      outputPerMTok: 0,
    });
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "cost",
          pricing: { schemaVersion: 1, models: { "test-model": zeroEntry } },
        }),
      ),
    ).rejects.toThrow(/all zero/);
    expect(calls()).toBe(0);
  });

  it("rejects a gated entry with an empty source before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    const model = Object.values(validTable().models)[0];
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: { "test-model": { ...model, source: "   " } } },
        }),
      ),
    ).rejects.toThrow(/nonempty source/);
    expect(calls()).toBe(0);
  });

  it("rejects a gated entry with an impossible calendar date before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    const model = Object.values(validTable().models)[0];
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: { "test-model": { ...model, effectiveDate: "2026-13-45" } } },
        }),
      ),
    ).rejects.toThrow(/effectiveDate/);
    expect(calls()).toBe(0);
  });

  it("rejects a negative or non-numeric rate on a gated entry before any provider execution", async () => {
    const model = Object.values(validTable().models)[0];
    const negative = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl: negative.fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: { "test-model": { ...model, inputPerMTok: -1 } } },
        }),
      ),
    ).rejects.toThrow(/finite non-negative number/);
    const nonNumeric = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl: nonNumeric.fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: { "test-model": { ...model, outputPerMTok: "15" } } },
        }),
      ),
    ).rejects.toThrow(/finite non-negative number/);
    expect(negative.calls()).toBe(0);
    expect(nonNumeric.calls()).toBe(0);
  });

  it("rejects an array entry without a model field and a conflicting model field before any provider execution", async () => {
    const model = Object.values(validTable().models)[0];
    const arrayForm = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl: arrayForm.fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: [model] },
        }),
      ),
    ).rejects.toThrow(/model name/);
    const conflict = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl: conflict.fetchImpl,
          gate: "release",
          pricing: { schemaVersion: 1, models: { "test-model": { ...model, model: "other-model" } } },
        }),
      ),
    ).rejects.toThrow(/conflicting model field/);
    expect(arrayForm.calls()).toBe(0);
    expect(conflict.calls()).toBe(0);
  });

  it("rejects structured pricing supplied without any gate designation before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          pricing: validTable(),
        }),
      ),
    ).rejects.toThrow(/CAVEMAN_EVAL_GATE=cost or release/);
    expect(calls()).toBe(0);
  });

  it("rejects an unknown gate designation before any provider execution", async () => {
    const { fetchImpl, calls } = spyFetch();
    await expect(
      evaluate.runProviderEvaluation(
        baseOptions("http://gate.invalid/v1/messages", {
          fetchImpl,
          gate: "budget",
          pricing: validTable(),
        }),
      ),
    ).rejects.toThrow(/CAVEMAN_EVAL_GATE must be 'cost' or 'release'/);
    expect(calls()).toBe(0);
  });

  it("records the gate, the structured table, and explicit-rate costs for primary and judge processes", async () => {
    const server = createMockServer();
    await server.start();
    // Judge traffic returns complete usage so explicit judge rates apply.
    const judgeFetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              completeness: { A: 4, B: 4 },
              correctness: { A: 4, B: 4 },
              groundedness: { A: 4, B: 4 },
              notes: "equal",
            }),
          },
        ],
        usage: {
          input_tokens: 30,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
      text: async () => "",
      headers: new Map(),
    });
    try {
      const table = {
        schemaVersion: 1,
        models: {
          ...validTable().models,
          "judge-model": {
            source: "registry pricing, verified 2026-08-29",
            effectiveDate: "2026-08-29",
            inputPerMTok: 5,
            cacheWritePerMTok: 6.25,
            cacheReadPerMTok: 0.5,
            outputPerMTok: 30,
          },
        },
      };
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), {
          gate: "cost",
          pricing: table,
          judge: true,
          judgeModel: "judge-model",
          judgeFetchImpl,
        }),
      );
      expect(report.gate).toBe("cost");
      expect(report.validatorVersion).toBe("schema4-corrected-v11");
      expect(report.pricing).toEqual(table);
      expect(report.runIdentity.gate).toBe("cost");
      expect(report.runIdentity.pricing).toEqual(table);
      const off = report.results.find((result) => result.mode === "off");
      const active = report.results.find((result) => result.mode === "full");
      // Mock usage: input 100, cache write 50, cache read 25, output 40/20.
      expect(off?.costUsd).toBe(0.001095);
      expect(off?.providerReportedCostUsd).toBe(null);
      expect(active?.costUsd).toBe(0.000795);
      const judged = report.results.find(
        (result) => result.mode === "full" && result.judge !== null && result.judge.failed !== true,
      );
      // Judge explicit rates: (30*5 + 10*30)/1e6 = 0.00045.
      expect(judged?.judge?.costUsd).toBe(0.00045);
      expect(judged?.judge?.providerReportedCostUsd).toBe(null);
    } finally {
      server.stop();
    }
  });

  it("keeps an unpriced provider-reported zero out of costUsd while recording it raw", async () => {
    const jsonl = [
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Do not delete backups. cache_key uses model identity." }],
          usage: { input: 50, output: 30, cacheRead: 10, cacheWrite: 5, cost: { total: 0 } },
        },
      }),
    ].join("\n");
    const report = await evaluate.runProviderEvaluation(
      baseOptions("unused://endpoint", {
        provider: "pi",
        apiKey: undefined,
        spawnImpl: async () => ({ code: 0, stdout: jsonl, stderr: "" }),
      }),
    );
    // No pricing is supplied, so a provider-reported zero must not masquerade
    // as a completed monetary total: zero means unknown here, not free.
    expect(report.results.every((result) => result.costUsd === null)).toBe(true);
    expect(report.results.every((result) => result.providerReportedCostUsd === 0)).toBe(true);
    expect(report.results.every((result) => result.rawUsage?.cost?.total === 0)).toBe(true);
  });
});
