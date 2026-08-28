// Deterministic paragraph-count validator tests.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("paragraph-count validator", () => {
  const config = { count: 4 };

  it("passes on the exact requested paragraph count", () => {
    const text =
      "## Setup\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.";
    const outcome = runValidators(text, [{ id: "paragraph-count", ...config }], noTool);
    expect(outcome.passed).toBe(true);
  });

  it("fails on a different paragraph count", () => {
    const outcome = runValidators(
      "One.\n\nTwo.\n\nThree.",
      [{ id: "paragraph-count", ...config }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.checks[0]?.detail).toContain("found 3");
  });

  it("ignores trailing conversational commentary after a headed artifact", () => {
    const outcome = runValidators(
      "I checked the request first.\n\n# Installation\n\nInstall the package from the registry.\n\nLet me know if you want changes.",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("keeps conversational wording in a requested second paragraph", () => {
    const outcome = runValidators(
      "# Installation\n\nInstall the package from the registry.\n\nLet me know if you want to install it globally. This paragraph belongs to the document.\n\nThe draft is ready for review.",
      [{ id: "paragraph-count", count: 2, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("fails when a genuine extra document paragraph follows the request", () => {
    const outcome = runValidators(
      "# Installation\n\nInstall the package from the registry.\n\nConfigure the package before first use.\n\nThis third paragraph is part of the requested document.",
      [{ id: "paragraph-count", count: 2, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
  });

  it("keeps a requested paragraph that starts conversationally", () => {
    const outcome = runValidators(
      "# Installation\n\nFeel free to install the package from the registry for shared tooling.",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });
});
