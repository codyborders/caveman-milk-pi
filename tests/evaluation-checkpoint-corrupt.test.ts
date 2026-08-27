// Corrupt checkpoint files must fail closed with a clear remediation message
// instead of crashing with a raw parse error.

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

describe("corrupt checkpoint handling", () => {
  it("rejects an unparseable checkpoint with a clear message", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-corrupt-"));
    tempDirs.push(root);
    const checkpointPath = path.join(root, "checkpoint.json");
    fs.writeFileSync(checkpointPath, "{not json", "utf8");
    expect(() => evaluate.openCheckpoint({ path: checkpointPath, runId: "run-x" })).toThrow(
      /corrupt and cannot be parsed/,
    );
  });
});
