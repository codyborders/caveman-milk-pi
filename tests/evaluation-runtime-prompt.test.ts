// Runtime prompt contract: the direct provider path must send production
// runtime prompt text from src/prompt-contract.json for every mode, the
// report must carry the runtime prompt hash, and a contract change must
// invalidate checkpoint reuse.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { computeInjection } from "../src/injection.js";
import { VALID_MODES } from "../src/types.js";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer, fixtures } from "./helpers/mock-provider-server.js";

describe("runtime prompt contract", () => {
  it("sends the production runtime prompt text for every mode in direct requests", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), { modes: fixtures.modes }),
      );
      expect(report.caseCount).toBe(fixtures.modes.length * 3);
      for (const entry of server.requests()) {
        const mode = JSON.parse(entry.body.metadata.user_id).mode;
        const sent = entry.body.system.map((block) => block.text).join("");
        const base = evaluate.loadPiBaseSystemPrompt();
        expect(sent).toBe(base + computeInjection(mode).text);
      }
    } finally {
      server.stop();
    }
  });
});
