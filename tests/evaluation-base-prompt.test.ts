// Pi base-prompt append: the direct provider runner must send the captured Pi
// base system prompt with caveman runtime text appended after it.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer, fixtures } from "./helpers/mock-provider-server.js";

describe("pi base prompt append", () => {
  it("sends the captured Pi base prompt plus appended caveman text", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const report = await evaluate.runProviderEvaluation(baseOptions(server.url()));
      const base = evaluate.loadPiBaseSystemPrompt();
      expect(base.startsWith("You are an expert coding assistant operating inside pi")).toBe(true);
      const fullRequest = server
        .requests()
        .find((entry) => JSON.parse(entry.body.metadata.user_id).mode === "full");
      const offRequest = server
        .requests()
        .find((entry) => JSON.parse(entry.body.metadata.user_id).mode === "off");
      const fullSystem = fullRequest.body.system.map((block) => block.text).join("");
      const offSystem = offRequest.body.system.map((block) => block.text).join("");
      expect(offSystem).toBe(base);
      expect(fullSystem.startsWith(base)).toBe(true);
      expect(fullSystem.substring(base.length)).toBe(fixtures.runtimePrompts.full);
      expect(offRequest.body.system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(fullRequest.body.system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(fullRequest.body.system[1].cache_control).toBeUndefined();
      expect(report.caseCount).toBe(6);
    } finally {
      server.stop();
    }
  });
});
