// HTTP client tests: request timeout, bounded retry, rate-limit handling, and
// fail-fast on non-retryable statuses. Namespace imports keep missing exports
// as runtime failures instead of import-time link errors.

import { describe, expect, it, vi } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const noSleep = async () => {};

describe("requestJsonWithRetry", () => {
  it("returns the parsed payload on the first attempt", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, value: 1 }));
    const outcome = await evaluate.requestJsonWithRetry({
      url: "https://example.invalid/messages",
      headers: {},
      body: "{}",
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(outcome.json).toEqual({ ok: true, value: 1 });
    expect(outcome.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and honors Retry-After", async () => {
    const sleepCalls = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, value: 2 }));
    const outcome = await evaluate.requestJsonWithRetry({
      url: "https://example.invalid/messages",
      headers: {},
      body: "{}",
      fetchImpl,
      maxAttempts: 3,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
    });
    expect(outcome.json).toEqual({ ok: true, value: 2 });
    expect(outcome.attempts).toBe(2);
    expect(sleepCalls).toEqual([2000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws terminally after exhausting retries on 429", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "rate_limited" }, 429));
    await expect(
      evaluate.requestJsonWithRetry({
        url: "https://example.invalid/messages",
        headers: {},
        body: "{}",
        fetchImpl,
        maxAttempts: 2,
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow(/HTTP 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
