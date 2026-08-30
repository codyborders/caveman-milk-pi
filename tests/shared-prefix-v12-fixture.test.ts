// Holdout fixture contract for the shared-prefix concise contract v12.
// The fixture owns two groups: eligible-prose (candidate may run) and
// protected-content (candidate and finalizer work must never run). The
// candidate contract text itself lives only in the evaluator module, so the
// fixture cannot drift into duplicating prompt rules.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(root, "scripts", "eval", "shared-prefix-v12-fixtures.json");

interface FixtureTask {
  id: string;
  kind: string;
  prompt: string;
  requiredFacts: string[];
  childTasks?: string[];
  workspaceFiles?: { path: string; contents: string }[];
}

interface FixtureGroup {
  id: string;
  classification: string;
  tasks: FixtureTask[];
}

function loadFixture(): { version: number; groups: FixtureGroup[] } {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

const REQUIRED_ELIGIBLE_KINDS = [
  "technical-explanation",
  "implementation-recap",
  "comparison",
  "routine-progress-summary",
  "completion-summary",
  "noncritical-troubleshooting",
  "removable-repetition",
];

const REQUIRED_PROTECTED_KINDS = [
  "warning",
  "confirmation",
  "command",
  "path",
  "ordered-procedure",
  "persisted-artifact",
  "agent-handoff",
];

describe("shared-prefix-v12 holdout fixture", () => {
  it("defines exactly the eligible-prose and protected-content groups", () => {
    const fixture = loadFixture();
    expect(fixture.version).toBe(12);
    expect(fixture.groups.map((group) => group.id)).toEqual([
      "eligible-prose",
      "protected-content",
    ]);
    expect(fixture.groups.map((group) => group.classification)).toEqual([
      "eligible",
      "protected",
    ]);
  });

  it("covers every required eligible-prose kind with required facts and real children", () => {
    const fixture = loadFixture();
    const eligible = fixture.groups.find((group) => group.id === "eligible-prose");
    expect(eligible).toBeDefined();
    const kinds = eligible!.tasks.map((task) => task.kind);
    for (const kind of REQUIRED_ELIGIBLE_KINDS) {
      expect(kinds, `missing eligible kind ${kind}`).toContain(kind);
    }
    for (const task of eligible!.tasks) {
      expect(task.requiredFacts.length, `${task.id} needs required facts`).toBeGreaterThan(0);
      expect(
        task.requiredFacts.every((fact) => fact.trim().length > 0),
        `${task.id} has an empty required fact`,
      ).toBe(true);
      expect((task.childTasks ?? []).length, `${task.id} must declare real child tasks`).toBeGreaterThan(0);
      expect(task.prompt.trim().length, `${task.id} prompt is empty`).toBeGreaterThan(0);
    }
  });

  it("covers every required protected-content kind with required facts and no child tasks", () => {
    const fixture = loadFixture();
    const protectedGroup = fixture.groups.find((group) => group.id === "protected-content");
    expect(protectedGroup).toBeDefined();
    const kinds = protectedGroup!.tasks.map((task) => task.kind);
    for (const kind of REQUIRED_PROTECTED_KINDS) {
      expect(kinds, `missing protected kind ${kind}`).toContain(kind);
    }
    for (const task of protectedGroup!.tasks) {
      expect(task.requiredFacts.length, `${task.id} needs required facts`).toBeGreaterThan(0);
      expect(
        task.requiredFacts.every((fact) => fact.trim().length > 0),
        `${task.id} has an empty required fact`,
      ).toBe(true);
      expect(task.childTasks ?? [], `${task.id} must not declare child tasks`).toHaveLength(0);
      expect(task.prompt.trim().length, `${task.id} prompt is empty`).toBeGreaterThan(0);
    }
  });

  it("uses unique task ids and contained non-empty workspace files", () => {
    const fixture = loadFixture();
    const tasks = fixture.groups.flatMap((group) => group.tasks);
    const ids = tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const task of tasks) {
      for (const file of task.workspaceFiles ?? []) {
        expect(
          file.path.startsWith("/") || file.path.includes(".."),
          `${task.id} workspace path must be relative and contained`,
        ).toBe(false);
        expect(
          file.contents.length,
          `${task.id} workspace file ${file.path} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the candidate contract text in the evaluator module, not the fixture", async () => {
    const modulePath = path.join(root, "scripts", "eval", "shared-prefix-v12.mjs");
    expect(fs.existsSync(modulePath), `${modulePath} must exist`).toBe(true);
    const fixture = loadFixture();
    const serialized = JSON.stringify(fixture);
    const evaluator = await import("../scripts/eval/shared-prefix-v12.mjs");
    expect(typeof evaluator.CANDIDATE_CONTRACT_V12).toBe("string");
    expect(evaluator.CANDIDATE_CONTRACT_V12.length).toBeGreaterThan(0);
    expect(serialized.includes(evaluator.CANDIDATE_CONTRACT_V12)).toBe(false);
  });
});
