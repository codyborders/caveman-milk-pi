// Seeded arm-order tests: randomization must be reproducible from a stored
// seed and must keep every arm exactly once per pair.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("createArmOrder", () => {
  it("returns a deterministic permutation for a stored seed", () => {
    const first = evaluate.createArmOrder(["off", "lite", "full"], 12345);
    const second = evaluate.createArmOrder(["off", "lite", "full"], 12345);
    expect(second).toEqual(first);
    expect([...first].sort()).toEqual(["full", "lite", "off"]);
  });
});
