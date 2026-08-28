// Checkpoint failure and resume: a terminal failure preserves completed calls
// and the resumed run never repeats a completed paid call.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

describe("checkpoint failure and resume", () => {
  it("aborts with preserved progress and resumes without repeats", async () => {
    const server = createMockServer();
    await server.start();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-resume-"));
    const checkpointPath = path.join(dir, "checkpoint.json");
    // Fail a late key terminally: retries exhaust on 500 for this key only.
    server.fail("3::technical-explanation::full");
    try {
      const options = baseOptions(server.url(), {
        checkpointPath,
        maxAttempts: 1,
      });
      await expect(evaluate.runProviderEvaluation(options)).rejects.toThrow(
        /aborted at 3::technical-explanation::full/,
      );

      const stored = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      const completedCount = Object.keys(stored.completedCalls).length;
      expect(completedCount).toBeGreaterThanOrEqual(1);
      expect(stored.failures.length).toBe(1);
      const requestsAfterFailure = server.requestCount();

      server.clearFailures();
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { checkpointPath, maxAttempts: 1 }),
      );
      expect(report.passed).toBe(true);
      expect(report.caseCount).toBe(6);
      const newRequests = server.requestCount() - requestsAfterFailure;
      expect(newRequests).toBe(6 - completedCount);
      const resumedKeys = report.results
        .filter((result) => result.resumed === true)
        .map((result) => result.key);
      expect(resumedKeys.length).toBe(completedCount);
    } finally {
      server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
