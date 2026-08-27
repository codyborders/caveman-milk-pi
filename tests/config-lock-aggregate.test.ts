// Release-failure aggregation: when an update fails while holding the lock
// and the release itself then fails unexpectedly, neither error may mask the
// other. Both surface through one AggregateError.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { updateConfigAtPath } from "../src/config.js";
import type { CavemanConfig } from "../src/types.js";

const INITIAL: CavemanConfig = { schemaVersion: 1, mode: "off", showStatus: true };

describe("updateConfigAtPath release failure aggregation", () => {
  it("aggregates a release failure with an in-flight update failure", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-config-aggregate-"));
    const configPath = path.join(directory, "caveman-milk-pi.json");
    fs.writeFileSync(configPath, JSON.stringify(INITIAL, null, 2) + "\n", "utf8");
    const lockPath = `${configPath}.lock`;

    const mutatorFailure = new Error("mutator exploded");
    await expect(
      updateConfigAtPath(configPath, () => {
        // Break the lock entry so the release path fails unexpectedly.
        fs.rmSync(lockPath, { force: true });
        fs.mkdirSync(lockPath);
        throw mutatorFailure;
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toContain(mutatorFailure);
      return true;
    });

    expect(fs.statSync(lockPath).isDirectory()).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(INITIAL);
  });
});
