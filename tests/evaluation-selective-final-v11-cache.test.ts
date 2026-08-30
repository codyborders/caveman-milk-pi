import { describe, expect, it } from "vitest";
import { cacheEligibility } from "../scripts/eval/selective-final-v11.mjs";
describe("selective-final cache eligibility", () => {
  it("requires every parent, child, and finalizer node to be eligible", () => {
    expect(cacheEligibility({ usage: { cacheRead: 0 }, nested: { complete: true, children: [{ usage: { cacheRead: 0 } }] }, finalizer: { usage: { cacheRead: 0 } } }, "zero")).toBe(true);
    expect(cacheEligibility({ usage: { cacheRead: 0 }, nested: { complete: true, children: [{ usage: { cacheRead: 1 } }] }, finalizer: { usage: { cacheRead: 0 } } }, "zero")).toBe(false);
  });

  it("uses first provider turns instead of multi-turn aggregate reads", () => {
    const childFirstTurn = JSON.stringify({
      type: "message_end",
      message: { role: "assistant", usage: { cacheRead: 0 } },
    });
    const result = {
      usage: { cacheRead: 4096 },
      usageTurns: [{ cacheRead: 0 }, { cacheRead: 4096 }],
      nested: {
        complete: true,
        children: [{ usage: { cacheRead: 2048 }, rawEvents: [childFirstTurn] }],
      },
      finalizer: { usage: { cacheRead: 0 }, usageTurns: [{ cacheRead: 0 }] },
    };
    expect(cacheEligibility(result, "zero")).toBe(true);
    expect(cacheEligibility(result, "positive")).toBe(false);
  });
});
