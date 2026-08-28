// Covers fixture-set selection and stable identity in CLI and provider reports.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";
import { baseOptions, createMockServer } from "./helpers/mock-provider-server.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("fixture-set identity", () => {
  it("selects a fixture set through the CLI and records its verified hash", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "evaluation/fixture-manifest.json"), "utf8"));
    const fresh = evaluate.loadFixtures("fresh-v1");
    expect(manifest.fixtureSets["fresh-v1"].sha256).toBe(fresh.fixtureHash);

    const output = execFileSync(process.execPath, ["scripts/evaluate.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, CAVEMAN_EVAL_PROVIDER: "offline", CAVEMAN_EVAL_FIXTURE_SET: "fresh-v1" },
    });
    const report = JSON.parse(output);
    expect(report.fixtureSet).toBe("fresh-v1");
    expect(report.fixtureHash).toBe(fresh.fixtureHash);
  });

  it("includes fixture identity in provider run identity", async () => {
    const server = createMockServer();
    await server.start();
    try {
      const fixtures = evaluate.loadFixtures("benchmark-regression-v2");
      const report = await evaluate.runProviderEvaluation(
        baseOptions(server.url(), {
          fixtures,
          modes: ["off"],
          categories: ["technical-explanation"],
          repetitions: 3,
        }),
      );
      expect(report.runIdentity.fixtureSet).toBe("benchmark-regression-v2");
      expect(report.runIdentity.fixtureHash).toBe(fixtures.fixtureHash);
    } finally {
      server.stop();
    }
  });
});
