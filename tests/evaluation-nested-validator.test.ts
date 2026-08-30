// Nested-delegation requirement: the parent must call the delegation tool and
// the recorded tree must contain a complete child node with a response and
// usage. An incomplete tree fails validation.

import { describe, expect, it } from "vitest";
import { runRequirements } from "../scripts/eval/validators.mjs";

const requirement = {
  id: "delegation",
  kind: "nested-delegation",
  toolName: "delegate_eval_child",
  requiredTerms: ["Fix parseDelay in src/delay.ts"],
  hardGroup: "contract",
  protected: true,
};

const completeChild = {
  nodeId: "child-1",
  parentId: "root",
  responseText: "Fixed parseDelay in src/delay.ts. All 2 workspace tests pass.",
  usage: { input: 230, output: 30, cacheWrite: 6, cacheRead: 60 },
  assistantTurns: 2,
  toolCallCount: 1,
  rawEvents: ["{}"],
};

describe("nested-delegation validator", () => {
  it("passes when the delegation tool carries required terms and the tree is complete", () => {
    const validation = runRequirements("Parent verified the child fix. All 2 workspace tests pass.", [requirement], {
      toolCalls: [{ name: "delegate_eval_child", input: { task: "Fix parseDelay in src/delay.ts. Do not rename it." } }],
      nested: {
        rootNodeId: "root",
        children: [completeChild],
        complete: true,
      },
    });
    expect(validation.passed).toBe(true);
    expect(validation.checks[0].id).toBe("delegation");
  });

  it("fails with an incomplete tree finding when no child record exists", () => {
    const validation = runRequirements("Parent skipped delegation.", [requirement], {
      toolCalls: [{ name: "delegate_eval_child", input: { task: "Fix parseDelay in src/delay.ts." } }],
      nested: null,
    });
    expect(validation.passed).toBe(false);
    const findings = validation.checks[0].findings;
    expect(findings.some((finding) => finding.type === "incomplete-tree")).toBe(true);
  });

  it("checks protected terms in child responses separately from the parent task", () => {
    const handoffRequirement = {
      ...requirement,
      requiredChildResponseTerms: ["SECURITY WARNING", "Load test remains unfinished."],
    };
    const validation = runRequirements("Parent received the review.", [handoffRequirement], {
      toolCalls: [{
        name: "delegate_eval_child",
        input: {
          task: "Fix parseDelay in src/delay.ts. Report SECURITY WARNING and Load test remains unfinished.",
        },
      }],
      nested: {
        rootNodeId: "root",
        children: [{ ...completeChild, responseText: "SECURITY WARNING" }],
        complete: true,
      },
    });
    expect(validation.passed).toBe(false);
    expect(validation.checks[0].findings).toContainEqual(expect.objectContaining({
      type: "child-handoff-term-missing",
      id: "Load test remains unfinished.",
    }));
  });
});
