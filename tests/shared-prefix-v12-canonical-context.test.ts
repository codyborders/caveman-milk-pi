// Canonical source context for the shared-prefix v12 finalizer replay.
// Both finalizer arms must consume byte-identical source bytes; volatile
// measurement fields must never leak into the canonical form.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonicalSourceContext } from "../scripts/eval/shared-prefix-v12.mjs";

function sampleCapture() {
  return {
    schema: "shared-prefix-v12-capture/1",
    taskId: "eligible-technical-explanation",
    group: "eligible-prose",
    kind: "technical-explanation",
    task: { prompt: "Explain the retention rules.", requiredFacts: ["retention", "dry-run"] },
    parent: {
      nodeId: "parent",
      request: "Explain the retention rules.",
      responseText: "Retention rule R1 keeps seven daily snapshots.",
      transcript: [
        { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Retention rule R1 keeps seven daily snapshots." }] } },
      ],
      usage: { input: 900, output: 120, cacheRead: 0, cacheWrite: 0 },
      elapsedMs: 4200,
    },
    children: [
      {
        nodeId: "child-1",
        request: "List every retention rule.",
        responseText: "R1 daily seven, R2 weekly four.",
        transcript: [],
        usage: { input: 300, output: 40, cacheRead: 0, cacheWrite: 0 },
        elapsedMs: 2100,
      },
    ],
    workspace: [{ path: "backup-notes.md", sha256: "a".repeat(64), bytesBase64: "IyBCYWNrdXAgbm90ZXM=" }],
    toolResults: [{ nodeId: "child-1", tool: "read", summary: "backup-notes.md" }],
    requiredFactManifest: { facts: ["retention", "dry-run"], baseResponseRetained: ["retention"] },
  };
}

describe("canonical source context", () => {
  it("produces identical bytes for equal sources with volatile fields differing", () => {
    const first = sampleCapture();
    const second = sampleCapture();
    second.parent.elapsedMs = 999999;
    second.parent.usage = { input: 12345, output: 99, cacheRead: 77, cacheWrite: 5 };
    second.children[0].elapsedMs = 1;
    expect(buildCanonicalSourceContext(second)).toBe(buildCanonicalSourceContext(first));
  });

  it("hashes with sha256 and rejects a source hash mismatch before finalizer work", async () => {
    const evaluator = await import("../scripts/eval/shared-prefix-v12.mjs");
    expect(typeof evaluator.assertCanonicalSourceMatch).toBe("function");
    const bytes = buildCanonicalSourceContext(sampleCapture());
    const independentHash = crypto.createHash("sha256").update(bytes, "utf8").digest("hex");
    expect(evaluator.hashCanonicalSourceContext(bytes)).toBe(independentHash);
    expect(evaluator.assertCanonicalSourceMatch(bytes, independentHash)).toBe(true);
    const tampered = bytes.replace("seven daily snapshots", "three daily snapshots");
    expect(() => evaluator.assertCanonicalSourceMatch(tampered, independentHash)).toThrow(
      /mismatch/i,
    );
  });

  it("locks a capture to disk and reloads it only while the hash matches", async () => {
    const evaluator = await import("../scripts/eval/shared-prefix-v12.mjs");
    expect(typeof evaluator.lockCapture).toBe("function");
    expect(typeof evaluator.loadLockedCapture).toBe("function");
    const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-lock-"));
    const locked = evaluator.lockCapture(sampleCapture(), lockDir);
    const expectedPath = path.join(lockDir, `capture-${sampleCapture().taskId}.json`);
    expect(locked.path).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(locked.canonicalHash).toBe(
      crypto
        .createHash("sha256")
        .update(buildCanonicalSourceContext(sampleCapture()), "utf8")
        .digest("hex"),
    );
    const reloaded = evaluator.loadLockedCapture(locked.path);
    expect(reloaded.capture.taskId).toBe(sampleCapture().taskId);
    expect(reloaded.canonicalHash).toBe(locked.canonicalHash);
    const stored = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    stored.capture.parent.responseText = "Tampered base response.";
    fs.writeFileSync(expectedPath, JSON.stringify(stored, null, 2));
    expect(() => evaluator.loadLockedCapture(locked.path)).toThrow(/mismatch/i);
  });
});
