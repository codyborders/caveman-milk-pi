// Real-spawn test for the Pi runner's defaultSpawn input behavior. The child
// must see immediate EOF instead of waiting on an open stdin pipe. The probe
// is a local Node script, so no provider call happens.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

function writeProbe(name, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-pi-spawn-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, source, "utf8");
  return { dir, file };
}

const stdinProbe = `
const timer = setTimeout(() => {
  process.stderr.write("stdin never reached EOF");
  process.exit(99);
}, 3000);
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  clearTimeout(timer);
  process.stdout.write(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "stdin closed" }],
        usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
      },
    }) + "\\n",
  );
  process.exit(0);
});
`;

describe("pi runner default spawn behavior", () => {
  it("closes stdin for the spawned Pi process so it never blocks on EOF", async () => {
    const { dir, file } = writeProbe("stdin-probe.mjs", stdinProbe);
    try {
      const runner = evaluate.createPiRunner({
        piBin: file,
        extensionPath: "/repo/index.ts",
        model: "test-model",
        timeoutMs: 10000,
      });
      const outcome = await runner.execute({
        mode: "off",
        category: { id: "negation", prompt: "Explain this backup policy." },
        repetition: 1,
      });
      expect(outcome.text).toBe("stdin closed");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
