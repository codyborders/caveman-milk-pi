// Deterministic code-syntax validator tests. TypeScript syntax checking uses
// the local TypeScript compiler; no model call is involved.

import { describe, expect, it } from "vitest";
import { runValidators } from "../scripts/eval/validators.mjs";

const noTool = { toolCall: null, expectsTool: false };

describe("code-syntax validator", () => {
  const config = { language: "typescript", functionName: "parsePort" };

  it("passes on syntactically valid fenced TypeScript", () => {
    const text =
      "Here is the function.\n\n```ts\n/** Parses a port string. */\nfunction parsePort(value: string): number {\n  const parsed = Number.parseInt(value, 10);\n  return parsed;\n}\n```\n";
    const outcome = runValidators(text, [{ id: "code-syntax", ...config }], noTool);
    expect(outcome.passed).toBe(true);
  });
});
