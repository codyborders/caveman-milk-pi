// Paid-cap accounting: the cap bounds every actual HTTP attempt, including
// retries and judge calls. Logical cases are reported separately from actual
// attempts so a report shows what was planned versus what was spent.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("paid cap actual attempts", () => {
  it("aborts before the attempt that would overflow the cap after a retry", async () => {
    const server = createMockServer();
    // The server itself returns one throttled response so every issued
    // attempt, including the retry, is observed by the server.
    server.failOnce("1::technical-explanation::full");
    await server.start();
    try {
      const rejection = evaluate.runProviderEvaluation(
        baseOptions(server.url(), { maxPaidCalls: 6 }),
      );
      // The budget abort must surface immediately: not retried by the HTTP
      // client and not wrapped as a request failure on a later attempt.
      await expect(rejection).rejects.toThrow(
        /evaluation aborted at \S+: paid-call budget exhausted: 6 of 6 actual attempts spent/,
      );
      // Six logical calls plus one retry need seven actual attempts. The cap
      // allows six, so the seventh attempt is never issued and every issued
      // attempt reached the server.
      expect(server.requestCount()).toBe(6);
    } finally {
      server.stop();
    }
  });

  it("aborts when a judge retry would overflow the shared budget", async () => {
    const server = createMockServer();
    let judgeThrottledOnce = false;
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(String(init.body));
      const isJudge = body.metadata === undefined;
      if (isJudge && !judgeThrottledOnce) {
        judgeThrottledOnce = true;
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        });
      }
      return globalThis.fetch(url, init);
    };
    await server.start();
    try {
      // Six response arms plus three judge calls exhaust the cap of nine.
      // The first judge retry would be the tenth actual attempt.
      await expect(
        evaluate.runProviderEvaluation(
          baseOptions(server.url(), { maxPaidCalls: 9, judge: true, fetchImpl }),
        ),
      ).rejects.toThrow(
        /evaluation aborted during judge for \S+: paid-call budget exhausted: 9 of 9 actual attempts spent/,
      );
    } finally {
      server.stop();
    }
  });

  it("reports logical cases separately from actual attempts including retries and judge calls", async () => {
    const server = createMockServer();
    server.failOnce("1::technical-explanation::full");
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { maxPaidCalls: 10, judge: true }),
      );
      expect(report.passed).toBe(true);
      expect(report.paidCallAccounting).toEqual({
        cap: 10,
        planned: { provider: 6, judge: 3, countEndpoint: 0, total: 9 },
        actual: { provider: 7, judge: 3, countEndpoint: 0, total: 10 },
      });
    } finally {
      server.stop();
    }
  });

  it("counts token-count attempts against the cap and stops before overflow", async () => {
    const fixtures = evaluate.loadFixtures();
    let countRequests = 0;
    let caseRequests = 0;
    let throttledOnce = false;
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.messages?.[0]?.content === "Count this prompt.") {
        countRequests += 1;
        return new Response(JSON.stringify({ input_tokens: 10 }), { status: 200 });
      }
      const metadata = JSON.parse(body.metadata.user_id);
      const key = `${metadata.repetition}::${metadata.category}::${metadata.mode}`;
      if (key === "1::technical-explanation::full" && !throttledOnce) {
        throttledOnce = true;
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      caseRequests += 1;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "cache_key identity" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      );
    };
    // Two count requests plus six case calls plus one retry need nine
    // attempts. The cap of eight allows eight, so the ninth is never issued.
    // The pre-flight passes because the planned total is exactly eight.
    await expect(
      evaluate.runProviderEvaluation({
        apiKey: "k",
        model: "m",
        allowPaid: true,
        endpoint: "http://x/v1/messages",
        fetchImpl,
        fixtures: { ...fixtures, modes: ["off", "full"], categories: [fixtures.categories[0]] },
        modes: ["off", "full"],
        categories: ["technical-explanation"],
        repetitions: 3,
        seed: "0x5",
        execGit: () => "deadbeef",
        readPiVersion: () => "0",
        sleepImpl: async () => {},
        maxPaidCalls: 8,
        countTokens: true,
        countEndpoint: "http://x/v1/messages/count_tokens",
      }),
    ).rejects.toThrow(
      /paid-call budget exhausted: 8 of 8 actual attempts spent/,
    );
    expect(countRequests).toBe(2);
    // Five clean case responses reached this branch. The injected 429 and
    // the blocked retry return before the counter increments.
    expect(caseRequests).toBe(5);
  });

  it("rejects an invalid configuration before any token-count request", async () => {
    const fixtures = evaluate.loadFixtures();
    let anyRequest = 0;
    const fetchImpl = async () => {
      anyRequest += 1;
      return new Response(JSON.stringify({ input_tokens: 10 }), { status: 200 });
    };
    await expect(
      evaluate.runProviderEvaluation({
        apiKey: "k",
        model: "m",
        allowPaid: true,
        endpoint: "http://x/v1/messages",
        fetchImpl,
        fixtures: { ...fixtures, modes: ["off", "full"], categories: [fixtures.categories[0]] },
        modes: ["off", "full"],
        categories: ["technical-explanation"],
        repetitions: 3,
        seed: "not-hex",
        execGit: () => "deadbeef",
        readPiVersion: () => "0",
        sleepImpl: async () => {},
        countTokens: true,
        countEndpoint: "http://x/v1/messages/count_tokens",
      }),
    ).rejects.toThrow(/CAVEMAN_EVAL_SEED/);
    expect(anyRequest).toBe(0);
  });

  it("reports every Pi process as one provider attempt", async () => {
    const fixtures = evaluate.loadFixtures();
    const events = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "ok." }],
        usage: { input: 10, output: 5 },
      },
    });
    let spawns = 0;
    const report = await evaluate.runProviderEvaluation({
      provider: "pi",
      apiKey: undefined,
      model: "m",
      allowPaid: true,
      endpoint: "unused://",
      fixtures: { ...fixtures, modes: ["off", "full"], categories: [fixtures.categories[0]] },
      modes: ["off", "full"],
      categories: ["technical-explanation"],
      repetitions: 3,
      seed: "0x5",
      execGit: () => "deadbeef",
      readPiVersion: () => "0",
      sleepImpl: async () => {},
      maxPaidCalls: 6,
      spawnImpl: async () => {
        spawns += 1;
        return { code: 0, stdout: events, stderr: "" };
      },
    });
    expect(spawns).toBe(6);
    // One reserved provider attempt per Pi process. Internal retries inside
    // the Pi process are not observable and are not claimed.
    expect(report.paidCallAccounting.actual).toEqual({
      provider: 6,
      judge: 0,
      countEndpoint: 0,
      total: 6,
    });
  });
});
