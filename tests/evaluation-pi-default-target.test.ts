// The default Pi executable must be the package CLI JavaScript entry, not a
// platform-specific .bin shim, so default runs work on every platform.

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const jsonlEvents = [
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "ok." }],
      usage: { input: 1, output: 1 },
    },
  }),
].join("\n");

describe("pi runner default target", () => {
  it("targets the pi-coding-agent CLI JavaScript entry by default", async () => {
    const spawns = [];
    const runner = evaluate.createPiRunner({
      extensionPath: "/repo/index.ts",
      model: "test-model",
      spawnImpl: async (args, options) => {
        spawns.push({ args, options });
        return { code: 0, stdout: jsonlEvents, stderr: "" };
      },
    });
    await runner.execute({ mode: "off", category: { id: "c", prompt: "p" }, repetition: 1 });
    const expected = path.resolve(
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "bundle",
      "cli.js",
    );
    expect(path.resolve(spawns[0].args[0])).toBe(expected);
  });
});
