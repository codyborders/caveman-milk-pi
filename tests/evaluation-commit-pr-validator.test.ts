// Persisted commit/PR validator: exact recorded responses pin the boundary
// between usable drafts and refusals, with or without bullet punctuation.

import { describe, expect, it } from "vitest";
import { diagnoseCommitPrArtifacts, runRequirements } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

const requirement = [
  { id: "prose", kind: "persisted-prose", artifactType: "commit-pr", hardGroup: "contract", protected: true },
];

function draft(description: string): string {
  return `**Commit subject**
\`\`\`
Improve Config migration handling
\`\`\`

**PR description**
\`\`\`markdown
${description}
\`\`\``;
}

const targetedLiteRepetition2 = `No repo changes visible to me, so here's a draft you can adjust to the actual diff.

**Commit subject**
\`\`\`
Add config migration to new settings schema
\`\`\`

**PR description**
\`\`\`markdown
## Summary
- Migrate existing user settings to the new config schema on startup
- Back up the previous config file before applying changes
- Keep the migration idempotent so it is safe to run on every launch

## Config migration
- Detects legacy config versions and upgrades them automatically
- Preserves unknown keys instead of dropping them
- Writes a timestamped backup next to the active config for rollback

## Testing
- Unit tests cover old-to-new migration, missing keys, and corrupt-file fallback
- Manually verified an upgrade on a dev profile with no data loss
\`\`\`

If you share the actual diff or changed file paths, I'll tailor both to match.`;

describe("persisted commit-pr validator", () => {
  it("accepts the exact targeted lite repetition-2 draft with unpunctuated bullets", () => {
    const outcome = runRequirements(
      targetedLiteRepetition2,
      requirement,
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(outcome.passed).toBe(true);
    expect(diagnoseCommitPrArtifacts(targetedLiteRepetition2).valid).toBe(true);
  });

  it("rejects the exact targeted full response 'Let me check the repo state first.' with structured diagnostics", () => {
    const failing = runRequirements(
      "Let me check the repo state first.",
      requirement,
      { ...noTool, taskClass: "commit-pr" },
    );
    expect(failing.passed).toBe(false);
    const check = failing.checks[0];
    expect(check?.subjectValid).toBe(false);
    expect(check?.descriptionValid).toBe(false);
    expect(check?.extractedSubject).toBe("Let me check the repo state first.");
    expect(check?.descriptionWordCount).toBe(0);
    expect(check?.failedConditions).toEqual([
      "subject:terminal-punctuation",
      "description:missing",
    ]);
    expect(check?.detail).toContain("subject valid=false");
    expect(check?.detail).toContain("description valid=false");
    expect(check?.detail).toContain("subject:terminal-punctuation");
    expect(check?.detail).toContain("description:missing");
    const diagnostics = diagnoseCommitPrArtifacts("Let me check the repo state first.");
    expect(diagnostics.artifactType).toBe("commit-pr");
    expect(diagnostics.subject.extracted).toBe("Let me check the repo state first.");
    expect(diagnostics.subject.valid).toBe(false);
    expect(diagnostics.subject.failedConditions).toContain("terminal-punctuation");
    expect(diagnostics.description.wordCount).toBe(0);
    expect(diagnostics.description.valid).toBe(false);
    expect(diagnostics.description.failedConditions).toContain("missing");
  });

  it("accepts complete Markdown bullets with mixed terminal punctuation", () => {
    const diagnostics = diagnoseCommitPrArtifacts(draft([
      "- Preserve unknown keys during legacy Config migration.",
      "- Write validated settings atomically before replacing the old file",
    ].join("\n")));
    expect(diagnostics.valid).toBe(true);
  });

  it("accepts mixed prose and substantive Markdown bullets", () => {
    const diagnostics = diagnoseCommitPrArtifacts(draft([
      "Config migration preserves unknown keys during every legacy upgrade.",
      "- Write validated settings atomically before replacing the old file",
    ].join("\n")));
    expect(diagnostics.valid).toBe(true);
  });

  it("rejects short fragments and placeholder bullets with exact conditions", () => {
    const fragments = diagnoseCommitPrArtifacts(draft([
      "- Fast migration",
      "- Better config",
      "- Safer writes",
      "- Clear rollback",
    ].join("\n")));
    expect(fragments.valid).toBe(false);
    expect(fragments.failedConditions).toContain("description:incomplete-line");

    const placeholder = diagnoseCommitPrArtifacts(draft([
      "- Need context",
      "- Preserve all unknown settings during the Config migration process",
      "- Write validated settings atomically before replacing the old file",
    ].join("\n")));
    expect(placeholder.valid).toBe(false);
    expect(placeholder.failedConditions).toContain("description:placeholder-line");
  });

  it("reports a missing subject and a missing description separately", () => {
    const missingSubject = diagnoseCommitPrArtifacts(
      "**PR description:**\n```markdown\n- Preserve existing settings during migration\n- Reject malformed files before any write occurs\n```",
    );
    expect(missingSubject.subject.failedConditions).toContain("missing");
    expect(missingSubject.valid).toBe(false);
    const missingDescription = diagnoseCommitPrArtifacts(
      "**Commit subject:**\n```\nAdd config migration for legacy settings\n```",
    );
    expect(missingDescription.description.failedConditions).toContain("missing");
    expect(missingDescription.valid).toBe(false);
  });
});
