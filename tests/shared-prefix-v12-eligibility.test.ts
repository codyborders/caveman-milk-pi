// Eligibility classification and finalizer prompt gating for v12. The
// candidate contract may only be appended after a positive eligibility
// classification. Protected tasks must yield no finalizer prompt at all, so
// no extra finalizer work and zero prompt tokens can ever occur for them.

import { describe, expect, it } from "vitest";
import {
  CANDIDATE_CONTRACT_V12,
  SHARED_PREFIX_OFF_FINALIZER_PROMPT,
  classifyTask,
  finalizerPromptFor,
} from "../scripts/eval/shared-prefix-v12.mjs";

const eligibleTask = {
  id: "eligible-technical-explanation",
  kind: "technical-explanation",
  prompt: "Explain the retention rules.",
  requiredFacts: ["retention"],
  childTasks: ["List the rules."],
};

const protectedTask = {
  id: "protected-warning",
  kind: "warning",
  prompt: "State the production warning.",
  requiredFacts: ["PRODUCTION WARNING"],
};

describe("eligibility classification", () => {
  it("classifies groups and gates finalizer prompts on positive eligibility", () => {
    const eligible = classifyTask({ ...eligibleTask, group: "eligible-prose" });
    expect(eligible.classification).toBe("eligible");
    expect(eligible.candidateAllowed).toBe(true);
    expect(eligible.bypassFinalizers).toBe(false);

    const offPrompt = finalizerPromptFor("shared-prefix-off", eligible);
    expect(offPrompt).toBe(SHARED_PREFIX_OFF_FINALIZER_PROMPT);
    expect(offPrompt.includes(CANDIDATE_CONTRACT_V12)).toBe(false);

    const candidatePrompt = finalizerPromptFor("shared-prefix-candidate", eligible);
    expect(candidatePrompt.startsWith(SHARED_PREFIX_OFF_FINALIZER_PROMPT)).toBe(true);
    expect(candidatePrompt.endsWith(CANDIDATE_CONTRACT_V12)).toBe(true);
    // The only differing bytes between finalizer arms are the contract.
    expect(candidatePrompt.slice(0, offPrompt.length)).toBe(offPrompt);
  });

  it("keeps the candidate contract minimal, eligible-only, and free of protected-category lists", () => {
    const text = CANDIDATE_CONTRACT_V12;
    for (const phrase of ["concise", "complete", "required fact", "qualification", "no claims", "final answer"]) {
      expect(text.toLowerCase()).toContain(phrase);
    }
    for (const banned of ["warning", "command", "path", "confirmation"]) {
      expect(text.toLowerCase(), `contract must not list protected category '${banned}'`).not.toContain(banned);
    }
    expect(text.length).toBeLessThan(240);
  });
});
