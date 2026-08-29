// Deterministic paragraph-count validator tests.

import { describe, expect, it } from "vitest";
import { runRequirements, runValidators } from "../scripts/eval/validators.mjs";

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

  it("keeps a one-paragraph leading markdown wrapper ahead of headed commentary", () => {
    const outcome = runValidators(
      "```markdown\n# Installation\n\nInstall the package from the registry for shared tooling.\n```\n\n## Review notes\n\nThe first review paragraph must stay outside the document.\n\nThe second review paragraph must also stay outside the document.",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("counts a heading plus one prose paragraph according to includeHeadings", () => {
    const text = "# Installation\n\nInstall the package from the registry for shared tooling.";
    const included = runValidators(
      text,
      [{ id: "paragraph-count", count: 2, includeHeadings: true }],
      noTool,
    );
    const excluded = runValidators(
      text,
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(included.passed).toBe(true);
    expect(excluded.passed).toBe(true);
  });

  it("never counts fenced code as a paragraph when headings are included", () => {
    const outcome = runValidators(
      "# Installation\n\n```bash\n# This shell comment is not a document heading.\nnpm install package\n```\n\nInstall the package from the registry for shared tooling.",
      [{ id: "paragraph-count", count: 2, includeHeadings: true }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts a complete leading tilde wrapper with empty language", () => {
    const outcome = runValidators(
      "~~~\n# Installation\n\nInstall the package from the registry for shared tooling.\n~~~\n\n# Commentary",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts every complete leading document wrapper before later content", () => {
    for (const language of ["", "markdown", "md", "text", "plaintext"]) {
      const opening = language === "" ? "~~~" : `~~~${language}`;
      const outcome = runValidators(
        `${opening}\n# Installation\n\nInstall the package from the registry for shared tooling.\n~~~\n\n# Commentary`,
        [{ id: "paragraph-count", count: 1, includeHeadings: false }],
        noTool,
      );
      expect(outcome.passed, language || "empty language").toBe(true);
    }
  });

  it("prioritizes a four-backtick markdown wrapper with a shorter nested bash fence", () => {
    const outcome = runValidators(
      "````markdown\n# Installation\n\nInstall the package from the registry for shared tooling.\n\n```bash\nnpm install package\n```\n````\n\n## Review notes\n\nThe first review paragraph must stay outside the document.\n\nThe second review paragraph must also stay outside the document.",
      [{ id: "paragraph-count", count: 1, includeHeadings: false }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("falls through invalid leading shell and JSON wrappers to an outside heading", () => {
    for (const language of ["bash", "json"]) {
      const outcome = runValidators(
        "\n```" + language + "\n# Hidden code heading\n```\n\n# Installation\n\nInstall the package from the registry for shared tooling.",
        [{ id: "paragraph-count", count: 1, includeHeadings: false }],
        noTool,
      );
      expect(outcome.passed, language).toBe(true);
    }
  });

  it("defaults missing includeHeadings to true", () => {
    const outcome = runRequirements(
      "# Installation\n\nInstall the package from the registry for shared tooling.",
      [{ kind: "paragraph-count", count: 2 }],
      noTool,
    );
    expect(outcome.passed).toBe(true);
  });

  it("uses one document boundary for paragraph count and persisted prose", () => {
    const outcome = runRequirements(
      "```markdown\n# Installation\n\nInstall the extension through Pi, then select a mode from the command menu. The default remains off until enabled.\n```\n\n## Review notes\n\nNeeds work.\n\nAdd detail.",
      [
        { kind: "paragraph-count", count: 1, includeHeadings: false },
        { kind: "persisted-prose", artifactType: "readme-paragraph", minWords: 12 },
      ],
      { ...noTool, taskClass: "file-output" },
    );
    expect(outcome.checks[0]?.passed).toBe(true);
    expect(outcome.checks[1]?.passed).toBe(true);
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
