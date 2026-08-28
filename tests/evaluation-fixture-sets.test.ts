import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("fixture sets", () => {
  it("loads named fixture sets with stable identity hashes", () => {
    const fixtures = evaluate.loadFixtures("fresh-v1");
    expect(fixtures.fixtureSet).toBe("fresh-v1");
    expect(fixtures.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
