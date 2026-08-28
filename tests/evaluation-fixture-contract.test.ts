// Fixture contract: prompt rules live only in src/prompt-contract.json.
// The evaluation fixture must not duplicate them (fix: prompt parity drift).

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(root, "scripts", "evaluation-fixtures.json"), "utf8"),
) as Record<string, unknown>;

describe("evaluation fixture prompt contract", () => {
  it("does not duplicate prompt-contract rules in the fixture file", () => {
    expect(fixtures).not.toHaveProperty("commonRules");
    expect(fixtures).not.toHaveProperty("modeRules");
  });
});
