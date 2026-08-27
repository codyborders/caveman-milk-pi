// The Pi runner must provide a working default spawn so the CLI pi provider
// works without an injected spawn implementation.

import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

describe("pi runner default spawn", () => {
  it("uses a real child process when no spawn is injected", async () => {
    const runner = evaluate.createPiRunner({
      piBin: "/bin/echo",
      extensionPath: "/repo/index.ts",
      model: "test-model",
    });
    // echo exits 0 with no JSON events, so execution must fail on the missing
    // assistant message rather than on a missing spawn implementation.
    await expect(
      runner.execute({ mode: "off", category: { id: "c", prompt: "p" }, repetition: 1 }),
    ).rejects.toThrow(/no assistant text/);
  });
});
