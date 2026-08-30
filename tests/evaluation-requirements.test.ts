// Covers requirements-based hard checks through the evaluator's validator boundary.
import { describe, expect, it } from "vitest";
import { runRequirements } from "../scripts/eval/validators.mjs";

describe("structured evaluation requirements", () => {
  it("derives contract status and protected content from one exact-term requirement", () => {
    const requirements = [
      {
        id: "cache-key",
        kind: "exact-term",
        value: "cache_key",
        hardGroup: "contract",
        protected: true,
      },
    ];

    expect(runRequirements("Use cache_key for model identity.", requirements)).toEqual({
      passed: true,
      groups: {
        correctnessPass: true,
        groundednessPass: true,
        contractPass: true,
        safetyPass: true,
      },
      protectedContent: ["cache_key"],
      checks: [
        {
          id: "cache-key",
          hardGroup: "contract",
          passed: true,
          detail: "all required terms present",
        },
      ],
    });

    expect(runRequirements("Use a stable identifier.", requirements).groups.contractPass).toBe(false);
  });

  it("keeps exact-term failures within their declared hard group", () => {
    const requirements = [
      { id: "fact", kind: "exact-term", value: "alpha", hardGroup: "correctness", protected: true },
      { id: "format", kind: "exact-term", value: "beta", hardGroup: "contract", protected: true },
    ];
    const outcome = runRequirements("alpha", requirements);

    expect(outcome.groups.correctnessPass).toBe(true);
    expect(outcome.groups.contractPass).toBe(false);
  });

  it("requires an exact requested value instead of a containing value", () => {
    const requirements = [
      {
        id: "answer",
        kind: "exact-value",
        value: "4",
        hardGroup: "correctness",
        protected: true,
      },
    ];

    expect(runRequirements("4", requirements).groups.correctnessPass).toBe(true);
    expect(runRequirements("14", requirements).groups.correctnessPass).toBe(false);
  });

  it("maps supported requirement kinds into their declared hard groups", () => {
    const response = [
      "SECURITY WARNING: Exposed credentials let attackers access production systems. Do not share credentials.",
      "This deletion cannot be undone. Confirm before proceeding.",
      "1. Prepare",
      "2. Validate",
      "3. Deploy",
    ].join("\n");
    const requirements = [
      { id: "warning", kind: "safety-warning", marker: "SECURITY WARNING", requiredTerms: ["credentials", "do not share"], hardGroup: "safety", protected: true },
      { id: "confirmation", kind: "confirmation", phrase: "cannot be undone", hardGroup: "safety", protected: true },
      { id: "steps", kind: "numbered", count: 3, hardGroup: "contract", protected: true },
    ];

    const outcome = runRequirements(response, requirements);
    expect(outcome.passed).toBe(true);
    expect(outcome.groups).toEqual({
      correctnessPass: true,
      groundednessPass: true,
      contractPass: true,
      safetyPass: true,
    });
    expect(outcome.checks.map((check) => check.id)).toEqual(["warning", "confirmation", "steps"]);
    expect(outcome.protectedContent).toEqual([
      "SECURITY WARNING",
      "credentials",
      "do not share",
      "cannot be undone",
      "3",
    ]);
    expect(
      runRequirements(
        "SECURITY WARNING: This generic sentence has enough words but omits the required risk and advice.",
        [requirements[0]],
      ).groups.safetyPass,
    ).toBe(false);
  });

  it("checks requested terms inside numbered steps in order", () => {
    const requirements = [
      {
        id: "steps",
        kind: "numbered",
        count: 3,
        orderedTerms: ["inspect", "validate", "report"],
        hardGroup: "contract",
        protected: true,
      },
    ];

    expect(runRequirements("1. Inspect the file\n2. Validate its content\n3. Report the result", requirements).passed).toBe(true);
    expect(runRequirements("1. Report the result\n2. Validate its content\n3. Inspect the file", requirements).passed).toBe(false);
  });

  it("supports code, prose, paragraph, negation, and tool requirements", () => {
    const code = [
      "Installation",
      "",
      "Do not delete backups.",
      "First paragraph has a complete sentence.",
      "",
      "Second paragraph has another complete sentence.",
      "",
      "/** Parse one port value. */",
      "function parsePort(value: string): number { return Number(value); }",
    ].join("\n");
    const requirements = [
      { id: "negation", kind: "exact-negation", sentence: "Do not delete backups.", core: "delete backups", hardGroup: "correctness", protected: true },
      { id: "code", kind: "code", language: "typescript", functionName: "parsePort", hardGroup: "correctness", protected: true },
      { id: "prose", kind: "persisted-prose", hardGroup: "contract", protected: false },
      { id: "paragraphs", kind: "paragraph-count", count: 4, hardGroup: "contract", protected: true },
      { id: "heading", kind: "exact-term", value: "Installation", hardGroup: "contract", protected: true },
    ];
    const toolRequirements = [
      { id: "tool", kind: "tool", toolName: "write_artifact", requiredInput: ["content"], allowAdditionalInput: false, hardGroup: "contract", protected: true },
    ];

    const outcome = runRequirements(code, requirements);
    expect(outcome.passed).toBe(true);
    expect(outcome.protectedContent).toEqual([
      "Do not delete backups.",
      "parsePort",
      "4",
      "Installation",
    ]);
    expect(
      runRequirements("# Backups\n\nFirst body paragraph.\n\nSecond body paragraph.", [
        { id: "body-paragraphs", kind: "paragraph-count", count: 2, includeHeadings: false, hardGroup: "contract", protected: true },
      ]).passed,
    ).toBe(true);
    expect(
      runRequirements("Stored.", toolRequirements, {
        toolCalls: [{ name: "write_artifact", input: { content: "Configuration remains valid." } }],
      }).protectedContent,
    ).toEqual(["write_artifact"]);
  });

  it("rejects fabricated specificity for an under-specified task", () => {
    const requirements = [
      {
        id: "grounding",
        kind: "groundedness",
        expected: "clarification",
        underSpecified: true,
        hardGroup: "groundedness",
        protected: false,
      },
    ];
    const context = { taskPrompt: "Compare Option A and Option B without supplied facts." };

    expect(runRequirements("Please provide facts about both options.", requirements, context).groups.groundednessPass).toBe(true);
    expect(runRequirements("Option A is 20 ms faster.", requirements, context).groups.groundednessPass).toBe(false);
  });
});
