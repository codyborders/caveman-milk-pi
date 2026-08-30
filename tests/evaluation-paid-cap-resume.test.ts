// Cumulative paid-cap persistence: attempt reservations (provider, judge,
// countEndpoint) survive checkpoint resume, so repeated invocations can never
// exceed maxPaidCalls in total. Old checkpoints without attempt data migrate
// from a conservative lower bound derived from completed calls.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempCheckpointPath(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return path.join(dir, "checkpoint.json");
}

function readCheckpoint(checkpointPath) {
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
}

// Mirrors buildPlan/derivePairSeed from scripts/evaluate.mjs so tests can
// assert exact attempt positions. Cross-checked against checkpoint.runOrder.
function expectedPlanKeys() {
  function hashToUint32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  const seed = 0xa1b2c3d4;
  const keys = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    const pairSeed =
      (hashToUint32(`${seed}:${repetition}:technical-explanation`) ^ (seed >>> 0)) >>> 0;
    const order = evaluate.createArmOrder(["off", "full"], pairSeed);
    keys.push(...order.map((mode) => `${repetition}::technical-explanation::${mode}`));
  }
  return keys;
}

function judgeRequestCount(server) {
  return server
    .requests()
    .filter(
      (entry) =>
        typeof entry.body.system === "string" &&
        entry.body.system.includes("Blinded Quality Judge"),
    ).length;
}

describe("cumulative paid-cap across checkpoint resume", () => {
  it("resumes a partial run with a retry and a terminal failure under the same cap", async () => {
    const server = createMockServer();
    await server.start();
    const checkpointPath = tempCheckpointPath("caveman-cap-resume-");
    const plan = expectedPlanKeys();
    // One throttled retry on the first key, then a terminal failure on the
    // last key. The failure retries three times before aborting.
    server.failOnce(plan[0]);
    server.fail(plan[5]);
    try {
      // First run: keys 1-5 complete (six attempts including the retry),
      // the last key fails terminally after three attempts. Nine spent.
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, maxPaidCalls: 10 }),
        ),
      ).rejects.toThrow(/aborted at 3::technical-explanation::off.*HTTP 500/);
      expect(server.requestCount()).toBe(9);
      const stored = readCheckpoint(checkpointPath);
      expect(Object.keys(stored.completedCalls)).toEqual(plan.slice(0, 5));
      expect(stored.runOrder).toEqual(plan.slice(0, 5));
      expect(stored.attemptReservations).toEqual({
        provider: 9,
        judge: 0,
        countEndpoint: 0,
      });

      // Resume under the same cap: the prior nine reservations count, so
      // exactly one further attempt fits before the cumulative total would
      // reach the cap. Completed calls are never repeated.
      server.clearFailures();
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { checkpointPath, maxPaidCalls: 10 }),
      );
      expect(report.passed).toBe(true);
      expect(report.caseCount).toBe(6);
      expect(server.requestCount()).toBe(10);
      expect(report.results.filter((result) => result.resumed === true).length).toBe(5);
      // Cumulative actual totals include every prior invocation; the
      // invocation block isolates this process's attempts.
      expect(report.paidCallAccounting).toEqual({
        cap: 10,
        planned: { provider: 6, judge: 0, countEndpoint: 0, total: 6 },
        actual: { provider: 10, judge: 0, countEndpoint: 0, total: 10 },
        invocation: { provider: 1, judge: 0, countEndpoint: 0, total: 1 },
      });
    } finally {
      server.stop();
    }
  });

  it("stops a resumed run before the cumulative total exceeds the cap", async () => {
    const server = createMockServer();
    await server.start();
    const checkpointPath = tempCheckpointPath("caveman-cap-overflow-");
    server.failOnce("1::technical-explanation::full");
    server.fail("3::technical-explanation::off");
    try {
      // One retry plus a triple terminal failure: nine attempts spent under
      // a cap of nine, so the run aborts on the terminal failure itself.
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, maxPaidCalls: 9 }),
        ),
      ).rejects.toThrow(/aborted at 3::technical-explanation::off.*HTTP 500/);
      expect(server.requestCount()).toBe(9);

      // Resuming with the same cap must refuse the next attempt before it is
      // issued: the cumulative total already equals the cap.
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, maxPaidCalls: 9 }),
        ),
      ).rejects.toThrow(
        /aborted at 3::technical-explanation::off: paid-call budget exhausted: 9 of 9 actual attempts spent/,
      );
      expect(server.requestCount()).toBe(9);
      const stored = readCheckpoint(checkpointPath);
      expect(stored.attemptReservations).toEqual({
        provider: 9,
        judge: 0,
        countEndpoint: 0,
      });
      // Both the terminal failure and the budget refusal are recorded.
      expect(stored.failures.length).toBe(2);
    } finally {
      server.stop();
    }
  });

  it("resumes judge work without repeating completed judge calls", async () => {
    const server = createMockServer();
    await server.start();
    const checkpointPath = tempCheckpointPath("caveman-cap-judge-");
    // One throttled retry on the first case burns a shared-cap attempt.
    server.failOnce("1::technical-explanation::full");
    try {
      // Six case attempts plus one retry, then two judge calls: nine spent,
      // so the third judge call is refused before it is issued.
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, judge: true, maxPaidCalls: 9 }),
        ),
      ).rejects.toThrow(
        /aborted during judge for 3::technical-explanation::full: paid-call budget exhausted: 9 of 9 actual attempts spent/,
      );
      expect(judgeRequestCount(server)).toBe(2);
      const stored = readCheckpoint(checkpointPath);
      expect(stored.attemptReservations).toEqual({
        provider: 7,
        judge: 2,
        countEndpoint: 0,
      });
      expect(
        Object.keys(stored.completedCalls).filter((key) => key.startsWith("judge::")).length,
      ).toBe(2);

      // Same cap: the resumed run refuses the remaining judge call without
      // repeating any completed case or judge call.
      const requestsAfterFirstRun = server.requestCount();
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { checkpointPath, judge: true, maxPaidCalls: 9 }),
        ),
      ).rejects.toThrow(/paid-call budget exhausted: 9 of 9 actual attempts spent/);
      expect(server.requestCount()).toBe(requestsAfterFirstRun);

      // One more unit of budget completes the final judge call cumulatively.
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { checkpointPath, judge: true, maxPaidCalls: 10 }),
      );
      expect(report.passed).toBe(true);
      expect(judgeRequestCount(server)).toBe(3);
      expect(report.paidCallAccounting.actual).toEqual({
        provider: 7,
        judge: 3,
        countEndpoint: 0,
        total: 10,
      });
      expect(report.paidCallAccounting.invocation).toEqual({
        provider: 0,
        judge: 1,
        countEndpoint: 0,
        total: 1,
      });
    } finally {
      server.stop();
    }
  });

  it("reuses completed count requests on resume instead of reissuing them", async () => {
    const server = createMockServer();
    await server.start();
    const checkpointPath = tempCheckpointPath("caveman-cap-count-");
    // Throttled retry on the second case burns a shared-cap attempt.
    server.failOnce("1::technical-explanation::off");
    let countRequests = 0;
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.messages?.[0]?.content === "Count this prompt.") {
        countRequests += 1;
        return new Response(JSON.stringify({ input_tokens: 100 + countRequests }), {
          status: 200,
        });
      }
      return globalThis.fetch(url, init);
    };
    const runOptions = (cap) =>
      baseOptions(server.url(), {
        checkpointPath,
        maxPaidCalls: cap,
        fetchImpl,
        countTokens: true,
        countEndpoint: "http://127.0.0.1:1/v1/messages/count_tokens",
      });
    try {
      // Two count attempts plus five completed cases plus one retry consume
      // the cap of eight; the sixth case is refused before it is issued.
      await expect(evaluate.runProviderEvaluation(runOptions(8))).rejects.toThrow(
        /aborted at 3::technical-explanation::off: paid-call budget exhausted: 8 of 8 actual attempts spent/,
      );
      expect(countRequests).toBe(2);
      const stored = readCheckpoint(checkpointPath);
      expect(stored.attemptReservations).toEqual({
        provider: 6,
        judge: 0,
        countEndpoint: 2,
      });
      expect(stored.countResults).toEqual({
        off: { model: "test-model", inputTokens: 101 },
        full: { model: "test-model", inputTokens: 102 },
      });

      // One more unit of budget finishes the run. The stored count results
      // are reused: no count request is reissued, so the final case attempt
      // is the only new spend.
      const report = await evaluate.runProviderEvaluation(runOptions(9));
      expect(report.passed).toBe(true);
      expect(countRequests).toBe(2);
      expect(report.tokenAccounting.totalRequestInputTokens).toEqual({ off: 101, full: 102 });
      expect(report.paidCallAccounting.actual).toEqual({
        provider: 7,
        judge: 0,
        countEndpoint: 2,
        total: 9,
      });
      expect(report.paidCallAccounting.invocation).toEqual({
        provider: 1,
        judge: 0,
        countEndpoint: 0,
        total: 1,
      });
    } finally {
      server.stop();
    }
  });

  it("rejects non-empty legacy checkpoints whose prior attempt total is unknown", () => {
    const checkpointPath = tempCheckpointPath("caveman-cap-legacy-unknown-");
    const legacy = {
      runId: "run-legacy-unknown",
      completedCalls: {
        "1::technical-explanation::off": { mode: "off" },
      },
      runOrder: ["1::technical-explanation::off"],
      failures: [{ key: "2::technical-explanation::full", error: "request failed" }],
    };
    const original = JSON.stringify(legacy, null, 2) + "\n";
    fs.writeFileSync(checkpointPath, original, "utf8");

    expect(() =>
      evaluate.openCheckpoint({ path: checkpointPath, runId: "run-legacy-unknown" }),
    ).toThrow(/predates cumulative attempt accounting/);
    expect(fs.readFileSync(checkpointPath, "utf8")).toBe(original);
  });

  it("keeps memory-checkpoint accounting local to the invocation", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { maxPaidCalls: 6 }),
      );
      expect(report.passed).toBe(true);
      expect(report.paidCallAccounting.actual).toEqual({
        provider: 6,
        judge: 0,
        countEndpoint: 0,
        total: 6,
      });
      // Without a checkpoint there is no cross-invocation state, so the
      // cumulative totals equal this invocation's attempts.
      expect(report.paidCallAccounting.invocation).toEqual(report.paidCallAccounting.actual);
    } finally {
      server.stop();
    }
  });
});

describe("checkpoint attempt reservation store", () => {
  it("persists attempt reservations and reloads them after a restart", () => {
    const checkpointPath = tempCheckpointPath("caveman-cp-attempts-");
    const store = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    store.recordAttempt("provider");
    store.recordAttempt("provider");
    store.recordAttempt("judge");
    store.recordAttempt("countEndpoint");
    expect(readCheckpoint(checkpointPath).attemptReservations).toEqual({
      provider: 2,
      judge: 1,
      countEndpoint: 1,
    });
    const reopened = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    expect(reopened.attemptReservations()).toEqual({
      provider: 2,
      judge: 1,
      countEndpoint: 1,
    });
  });

  it("initializes an empty legacy checkpoint with zero reservations", () => {
    const checkpointPath = tempCheckpointPath("caveman-cp-legacy-empty-");
    const legacy = {
      runId: "run-legacy-empty",
      completedCalls: {},
      runOrder: [],
      failures: [],
    };
    fs.writeFileSync(checkpointPath, JSON.stringify(legacy, null, 2) + "\n", "utf8");

    const store = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-legacy-empty" });
    expect(store.attemptReservations()).toEqual({
      provider: 0,
      judge: 0,
      countEndpoint: 0,
    });
    expect(readCheckpoint(checkpointPath).attemptReservations).toEqual({
      provider: 0,
      judge: 0,
      countEndpoint: 0,
    });
  });

  it("rejects corrupt attempt reservations instead of resetting the budget", () => {
    const checkpointPath = tempCheckpointPath("caveman-cp-corrupt-attempts-");
    const corrupt = {
      runId: "run-corrupt",
      completedCalls: {},
      attemptReservations: { provider: "many", judge: 0, countEndpoint: 0 },
    };
    fs.writeFileSync(checkpointPath, JSON.stringify(corrupt, null, 2) + "\n", "utf8");
    expect(() => evaluate.openCheckpoint({ path: checkpointPath, runId: "run-corrupt" })).toThrow(
      /corrupt \(attemptReservations must contain non-negative integers\)/,
    );
  });

  it("persists count results and reloads them after a restart", () => {
    const checkpointPath = tempCheckpointPath("caveman-cp-counts-");
    const store = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    expect(store.completedCount("off")).toBe(false);
    store.recordCount("off", { model: "m", inputTokens: 12 });
    expect(store.completedCount("off")).toBe(true);
    expect(store.storedCount("off")).toEqual({ model: "m", inputTokens: 12 });
    expect(readCheckpoint(checkpointPath).countResults).toEqual({
      off: { model: "m", inputTokens: 12 },
    });
    const reopened = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-1" });
    expect(reopened.completedCount("off")).toBe(true);
    expect(reopened.storedCount("off")).toEqual({ model: "m", inputTokens: 12 });
  });
});
