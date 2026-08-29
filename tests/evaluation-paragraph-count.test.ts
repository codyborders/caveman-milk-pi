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

  it("fails count one for two prose paragraphs around an internal bash fence", () => {
    const original = runValidators(
      "# Installation\n\nInstall the package from the registry.\n\nConfigure the package before first use.\n\nThis third paragraph is part of the requested document.",
      [{ id: "paragraph-count", count: 2, includeHeadings: false }],
      noTool,
    );
    expect(original.passed).toBe(false);

    const outcome = runValidators(
      "# Installation\n\nFirst requested paragraph has complete installation guidance.\n\n```bash\nnpm install package\n```\n\nSecond requested paragraph has more complete installation guidance.",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(false);
  });

  it("does not count blank-line-separated fenced code before conversational prose", () => {
    const outcome = runValidators(
      "# Installation\n\nInstall the extension through Pi, then select a mode from the command menu.\n\n```bash\nnpm install\n\npackage\n```\n\nLet me know if you want to install the extension globally. This requested paragraph remains part of the document.\n\nThe draft is ready for review.",
      [{ id: "paragraph-count", count: 2, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
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
