// Scope guard for the shared-prefix-v12 evaluation branch. Runtime files
// must match the byte hashes recorded from clean main commit abbf4dd.
// This check works in shallow CI checkouts without historical Git objects.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const RUNTIME_HASHES = {
  "index.ts": "4742332dee80fd7dc989614c497f85a7e7026199b59a26d11f7a1aab3490a853",
  "skill/SKILL.md": "3edd677596cbf12f010f25f05dfb1e8a6c9c178d92499c86e5b5afa44c86c16c",
  "src/command.ts": "cbb634572c257fd8b894cc87de5cd6996bb1943d1845b10d47f260aa9c73392a",
  "src/config.ts": "00bfe15d223aab5e044b026d6d6376848c476606d8913918fd61236738e196dc",
  "src/injection.ts": "f33e83381f3927b8ab6695bedc4960165a4f4f50d4964c37ff747dd45747f7e2",
  "src/prompt-contract.json": "08689c3d7687f119624ef0e9fdfd03574c5de27fea8cff0014f44943f93c8c7e",
  "src/types.ts": "85bb47fb8007a95ba26fb8502c26c1a4e2b228708684aa53931257d9a8020850",
} as const;

function hash(filePath: string): string {
  const normalized = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function filesUnder(directory: string): string[] {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    })
    .map((filePath) => filePath.split(path.sep).join("/"))
    .sort();
}

describe("shared-prefix-v12 scope", () => {
  it("keeps every clean-main runtime file byte-identical", () => {
    for (const [filePath, expectedHash] of Object.entries(RUNTIME_HASHES)) {
      expect(hash(path.join(root, filePath)), filePath).toBe(expectedHash);
    }
  });

  it("adds no runtime source or skill files", () => {
    const expected = Object.keys(RUNTIME_HASHES)
      .filter((filePath) => filePath.startsWith("src/") || filePath.startsWith("skill/"))
      .sort();
    expect([...filesUnder("src"), ...filesUnder("skill")].sort()).toEqual(expected);
  });
});
