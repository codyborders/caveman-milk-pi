// Deterministic persisted-prose validator tests. Persisted artifacts must keep
// normal prose even in aggressive caveman modes.

import { describe, expect, it } from "vitest";
import { runRequirements, runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("persisted-prose validator", () => {
  const config = { minWords: 12, minSentenceRatio: 0.75, minSentenceWords: 5 };

  it("passes on normal full prose", () => {
    const outcome = runValidators(
      "The configuration loader validates the schema before writing anything to disk. " +
        "Failed writes remove the temporary file so no partial state remains.",
      [{ id: "persisted-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts short conventional commit subjects", () => {
    const outcome = runValidators(
      "fix: config migration",
      [{ id: "persisted-prose", taskClass: "commit", minWords: 12 }],
      { ...noTool, taskClass: "commit" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts conventional commit plus grammatical PR summary", () => {
    const outcome = runRequirements(
      "**Commit subject:**\n```\nAdd config migration for legacy settings\n```\n\n**PR description:**\n```markdown\n## Summary\n- Preserve configuration across restart.\n- Validate malformed state before loading.\n```",
      [{ kind: "persisted-prose", artifactType: "commit-pr", minWords: 8 }],
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts an inline commit subject before a fenced PR description", () => {
    const outcome = runRequirements(
      "Commit subject: Add config migration for legacy settings\n\nPR description:\n```markdown\n## Summary\n- Preserve existing settings during migration.\n- Reject malformed files before any write occurs.\n```",
      [{ kind: "persisted-prose", artifactType: "commit-pr", minWords: 10 }],
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts a PR description with headings and grammatical bullets", () => {
    const outcome = runRequirements(
      "## Summary\n- Preserve existing settings during migration.\n- Reject malformed files before any write occurs.",
      [{ kind: "persisted-prose", artifactType: "pr-description", minWords: 10 }],
      { ...noTool, taskClass: "pull-request-description" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("keeps valid conversational prose when paragraph count sets the boundary", () => {
    const outcome = runRequirements(
      "# Installation\n\nInstall the package from the registry now.\n\nFeel free to install it globally when shared tooling needs one version. This paragraph remains part of the document.\n\nThe draft is ready for review.",
      [
        { kind: "paragraph-count", count: 2, includeHeadings: false },
        { kind: "persisted-prose", artifactType: "readme-paragraph", minWords: 12 },
      ],
      { ...noTool, taskClass: "file-output" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("counts paragraphs inside the requested fenced artifact only", () => {
    const outcome = runRequirements(
      "```markdown\n## Installation\n\nInstall the extension through Pi, then select a mode from the command menu. The default remains off until you enable it.\n```\n\nThe requested draft is ready.",
      [{ kind: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("requires full prose in a README paragraph", () => {
    const valid = runRequirements(
      "I prepared the requested text.\n\n## Installation\n\nInstall the extension through Pi, then select a mode from the command menu. The default remains off until you enable it.",
      [{ kind: "persisted-prose", artifactType: "readme-paragraph", minWords: 12 }],
      { ...noTool, taskClass: "file-output" },
    );
    const invalid = runRequirements(
      "I prepared the requested text.\n\n## Installation\n\nInstall extension. Pick mode. Default off.",
      [{ kind: "persisted-prose", artifactType: "readme-paragraph", minWords: 12 }],
      { ...noTool, taskClass: "file-output" },
    );
    expect(valid.passed).toBe(true);
    expect(invalid.passed).toBe(false);
  });

  it("ignores commentary before a valid requested artifact", () => {
    const outcome = runRequirements(
      "I checked the repository before drafting.\n\n**Commit subject:**\n```\nAdd config migration for legacy settings\n```\n\n**PR description:**\n```markdown\n## Summary\n- Preserve existing settings during migration.\n- Reject malformed files before any write occurs.\n```",
      [{ kind: "persisted-prose", artifactType: "commit-pr", minWords: 10 }],
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(outcome.passed).toBe(true);
  });

  it("rejects an invalid artifact after valid commentary", () => {
    const outcome = runRequirements(
      "The repository state is clear, and the requested format is understood.\n\n**Commit subject:**\n```\nNeed context\n```\n\n**PR description:**\n```markdown\nNeed context\n```",
      [{ kind: "persisted-prose", artifactType: "commit-pr", minWords: 10 }],
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(outcome.passed).toBe(false);
  });

  it("rejects short placeholders for requested persisted content", () => {
    const outcome = runRequirements(
      "Need context",
      [{ kind: "persisted-prose", artifactType: "pr-description", minWords: 10 }],
      { ...noTool, taskClass: "pull-request-description" },
    );
    expect(outcome.passed).toBe(false);
  });

  it("fails on telegraphic fragments", () => {
    const outcome = runValidators(
      "Loader validates schema. Writes atomic. Temp file removed on failure. Config safe.",
      [{ id: "persisted-prose", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("full prose");
  });
});
