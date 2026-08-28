// Retry integration: the provider path must use the bounded-retry client so a
// 429 with Retry-After is retried and the attempt count is recorded.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("provider retry integration", () => {
  it("retries a rate-limited call and records the attempt count", async () => {
    const server = createMockServer();
    let throttledOnce = false;
    await server.start();
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(String(init.body));
      const metadata = JSON.parse(body.metadata.user_id);
      const key = `${metadata.repetition}::${metadata.category}::${metadata.mode}`;
      if (key === "1::technical-explanation::full" && !throttledOnce) {
        throttledOnce = true;
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        });
      }
      return globalThis.fetch(url, init);
    };
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { fetchImpl }),
      );
      const retried = report.results.find(
        (result) => result.key === "1::technical-explanation::full",
      );
      expect(retried.attempts).toBe(2);
      expect(report.passed).toBe(true);
    } finally {
      server.stop();
    }
  });
});
