// Validator wiring: fixture validator configs must run against live provider
// responses and a dropped negation must fail the case and the overall report.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer, fixtures } from "./helpers/mock-provider-server.js";

describe("validator wiring", () => {
  it("fails the report when an active response drops the exact negation", async () => {
    const server = createMockServer();
    server.setCase((mode) => ({
      text:
        mode === "off"
          ? "Do not delete backups. Retention is enforced."
          : "Backups may be deleted after review. Retention enforced.",
      outputTokens: mode === "off" ? 30 : 10,
    }));
    await server.start();
    try {
      const negation = fixtures.categories.find((item) => item.id === "negation");
      expect(negation?.validators?.[0]?.id).toBe("exact-negation");
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { categories: ["negation"] }),
      );
      const active = report.results.find((result) => result.mode === "full");
      expect(active.validation.passed).toBe(false);
      expect(active.passed).toBe(false);
      expect(report.passed).toBe(false);
    } finally {
      server.stop();
    }
  });
});
