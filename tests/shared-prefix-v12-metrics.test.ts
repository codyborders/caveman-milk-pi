// Complete-tree token accounting, per-node cold/warm cache validation, and
// exclusion records for shared-prefix v12. Complete-tree tokens sum input,
// cache read, cache write, and output across every node in the arm's tree;
// any invalid usage field makes the total null so incomplete data can never
// enter the primary metrics.

import { describe, expect, it } from "vitest";
import {
  buildExclusion,
  firstTurnCacheRead,
  sumCompleteTreeTokens,
  validateNodeCacheState,
} from "../scripts/eval/shared-prefix-v12.mjs";

const node = (usage, usageTurns) => ({
  nodeId: "n",
  usage,
  ...(usageTurns === undefined ? {} : { usageTurns }),
});

const tree = {
  parent: node({ input: 100, output: 50, cacheRead: 0, cacheWrite: 20 }),
  children: [
    node({ input: 40, output: 10, cacheRead: 0, cacheWrite: 5 }),
    node({ input: 60, output: 15, cacheRead: 0, cacheWrite: 5 }),
  ],
  finalizer: node({ input: 12, output: 30, cacheRead: 500, cacheWrite: 8 }),
};

describe("complete-tree metrics", () => {
  it("sums input, cache read, cache write, and output across the whole tree", () => {
    const totals = sumCompleteTreeTokens(tree);
    expect(totals).toMatchObject({
      input: 100 + 40 + 60 + 12,
      cacheRead: 0 + 0 + 0 + 500,
      cacheWrite: 20 + 5 + 5 + 8,
      output: 50 + 10 + 15 + 30,
    });
    expect(totals.total).toBe(
      totals.input + totals.cacheRead + totals.cacheWrite + totals.output,
    );
  });
});
