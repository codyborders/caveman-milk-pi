import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runRequirements, runValidators } from "../scripts/eval/validators.mjs";

const targetedV3 = JSON.parse(
  readFileSync("scripts/evaluation-fixtures-targeted-v3.json", "utf8"),
);
const commitRequirements = targetedV3.categories.find(
  (category: { id: string }) => category.id === "commit-pr",
).requirements;
const validCommitPr = `Migrate legacy configuration

## Config migration

Legacy config.json migrates to settings.json. Unknown keys remain during migration. Writes are atomic.`;

describe("groundedness validation", () => {
  it("accepts clarification when required facts are absent", () => {
    const outcome = runValidators(
      "I need the latency_ms value and workload details before comparing these options.",
      [{ id: "groundedness", expected: "clarification" }],
      { taskPrompt: "Compare Option A and Option B; no option facts supplied." },
    );
    expect(outcome.passed).toBe(true);
  });

  it("rejects unsupported qualitative comparisons without numbers", () => {
    const outcome = runValidators(
      "Option A is better, but please provide more facts.",
      [{ id: "groundedness", expected: "clarification" }],
      { taskPrompt: "Compare Option A and Option B; no option facts supplied." },
    );
    expect(outcome.passed).toBe(false);
  });

  it("accepts soft-wrapped supplied facts without treating line fragments as claims", () => {
    const response = `Commit subject:
\`Config migration: move legacy config.json to settings.json\`

PR description:
\`\`\`
Config migration: legacy config.json migrates to settings.json. Unknown keys
remain in the migrated file. Writes are atomic.
\`\`\``;
    const outcome = runRequirements(response, commitRequirements, {
      artifactText: response,
      taskClass: "commit",
    });
    expect(outcome.passed).toBe(true);
  });

  it("accepts a commit and PR draft limited to targeted-v3 supplied facts", () => {
    const outcome = runRequirements(validCommitPr, commitRequirements, {
      artifactText: validCommitPr,
      taskClass: "commit",
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.groups.groundednessPass).toBe(true);
  });

  it.each([
    "Tests pass for the migration.",
    "The test suite passes with 100% coverage.",
    "Benchmarks show faster migration.",
    "The migration also updates loader.ts.",
    "The config module validates known keys.",
    "A backup is created before migration.",
    "The migration uses renameSync for atomic writes.",
    "The migration retries failed writes.",
    "Manual verification confirmed the migration.",
    "The migration preserves comments.",
    "The migration has two phases.",
    "It also preserves comments.",
    "A temporary copy is created first.",
    "Errors trigger cleanup.",
    "Tests were not supplied, but they pass.",
  ])("rejects the unsupported claim: %s", (claim) => {
    const response = `${validCommitPr} ${claim}`;
    const outcome = runRequirements(response, commitRequirements, {
      artifactText: response,
      taskClass: "commit",
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.groups.groundednessPass).toBe(false);
    expect(outcome.checks.find((check) => check.id === "supplied-facts")?.detail).toContain(
      "unsupported",
    );
  });

  it("allows explicit statements that facts were not supplied", () => {
    const response = `${validCommitPr}

## Testing
None supplied.

Tests and coverage were not supplied. No test coverage or implementation details are claimed. No benchmark results were provided. Backup behavior was not specified. No extra modules were identified. Manual verification was not supplied. Comment handling was not specified.`;
    const outcome = runRequirements(response, commitRequirements, {
      artifactText: response,
      taskClass: "commit",
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.groups.groundednessPass).toBe(true);
  });

  it("does not classify pass-through wording as a test-result claim", () => {
    const response = `${validCommitPr} The migration uses a pass-through layer.`;
    const outcome = runRequirements(response, commitRequirements, {
      artifactText: response,
      taskClass: "commit",
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.checks.find((check) => check.id === "supplied-facts")?.detail).not.toContain(
      "test or test-result claim",
    );
  });

  it("fails closed when supplied-facts configuration is empty", () => {
    const outcome = runRequirements(validCommitPr, [
      { id: "supplied-facts", kind: "supplied-facts", allowedFacts: [], hardGroup: "groundedness" },
    ]);

    expect(outcome.passed).toBe(false);
    expect(outcome.groups.groundednessPass).toBe(false);
  });
});
