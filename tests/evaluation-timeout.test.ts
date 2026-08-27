// Per-attempt timeout: a fetch that never resolves must abort, retry, and
// then fail terminally with the attempt count.

import { describe, expect, it, vi } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("request timeout", () => {
  it("aborts a hanging request and fails terminally after the attempt bound", async () => {
    const attempts = [];
    const fetchImpl = vi.fn((_url, init) => {
      attempts.push(1);
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("This operation was aborted")));
      });
    });
    await expect(
      evaluate.requestJsonWithRetry({
        url: "https://example.invalid/messages",
        headers: {},
        body: "{}",
        fetchImpl,
        timeoutMs: 20,
        maxAttempts: 2,
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow(/aborted/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
