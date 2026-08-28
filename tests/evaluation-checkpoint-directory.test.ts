// Checkpoint directory creation: a nested checkpoint path must create its
// directory chain before the first atomic write.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("checkpoint directory creation", () => {
  it("creates missing parent directories before the first write", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-cp-dir-"));
    tempDirs.push(root);
    const checkpointPath = path.join(root, "deep", "nested", "checkpoint.json");
    const store = evaluate.openCheckpoint({ path: checkpointPath, runId: "run-x" });
    store.recordCall("k1", { ok: true });
    expect(fs.existsSync(checkpointPath)).toBe(true);
    // Mode bits are a POSIX concept. Windows ACLs grant different defaults,
    // so the 0600 check only runs where mode bits are supported.
    if (process.platform !== "win32") {
      expect(fs.statSync(checkpointPath).mode & 0o777).toBe(0o600);
    }
  });
});
