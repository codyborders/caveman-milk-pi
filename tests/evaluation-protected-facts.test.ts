// Protected-fact manifest validator: fresh-v2 requirements must be checked
// against declared facts, not response shape or length. Red initial failure:
// the protected-facts requirement kind does not exist, so runRequirements
// fails the check closed as an unknown validator.

import { describe, expect, it } from "vitest";
import { runRequirements } from "../scripts/eval/validators.mjs";

describe("protected-facts requirement", () => {
  it("passes a response that carries every declared fact exactly", () => {
    const text = [
      "The parser reads src/config-loader.ts and honors CONFIG_TIMEOUT_MS.",
      "Do not disable audit logging.",
      "The default timeout was 30 seconds before this change.",
    ].join(" ");
    const validation = runRequirements(
      text,
      [
        {
          id: "facts",
          kind: "protected-facts",
          hardGroup: "correctness",
          protected: true,
          requiredClaims: [
            { id: "timeout-fact", text: "The default timeout was 30 seconds before this change." },
            { id: "env-fact", text: "honors CONFIG_TIMEOUT_MS", critical: false },
          ],
          negatedClaims: [
            { id: "audit", sentence: "Do not disable audit logging.", core: "disable audit logging" },
          ],
          identifiers: [{ id: "loader", value: "src/config-loader.ts" }],
          commands: [{ id: "env", value: "CONFIG_TIMEOUT_MS" }],
          numbers: [{ id: "timeout", value: 30 }],
        },
      ],
      {},
    );

    expect(validation.passed).toBe(true);
    expect(validation.checks[0].findings).toEqual([]);
    expect(validation.checks[0].summary).toMatchObject({
      requiredClaims: 2,
      criticalOmissions: 0,
      noncriticalOmissions: 0,
      alteredFacts: 0,
      unsupportedClaims: 0,
      orderingErrors: 0,
    });
    expect(validation.protectedContent).toContain("The default timeout was 30 seconds before this change.");
  });

  it("accepts semantic wording, Markdown punctuation, ordered steps, explicit gaps, and tool-backed test claims", () => {
    const outcome = runRequirements(
      [
        "**SECURITY WARNING** for a production database operation.",
        "The AUTH-77 fixture is missing.",
        "1. Create archive `/tmp/app.tar`.",
        "2. Run `sha256sum /tmp/app.tar`.",
        "Support: GAP — support contact not supplied.",
        "All 2 workspace tests pass.",
      ].join("\n"),
      [
        {
          id: "facts",
          kind: "protected-facts",
          requiredClaims: [
            { id: "missing", text: "AUTH-77 fixture is missing." },
            { id: "gap", text: "Support: GAP — support contact not supplied." },
          ],
          warnings: [{ id: "warning", marker: "SECURITY WARNING", requiredTerms: ["production database"] }],
          orderedActions: [{ id: "steps", items: ["create `/tmp/app.tar`", "sha256sum /tmp/app.tar"] }],
        },
        {
          id: "record",
          kind: "artifact-usability",
          artifactType: "fields",
          requiredFields: ["Support:"],
        },
      ],
      {
        sessionToolMetrics: { finalTestRunPassed: true, passingTestRuns: 1 },
      },
    );
    expect(outcome.passed).toBe(true);
  });

  it("checks protected facts across final text and recorded tool messages", () => {
    const outcome = runRequirements(
      "All 2 workspace tests pass.",
      [{
        id: "facts",
        kind: "protected-facts",
        requiredClaims: [{ id: "disabled", text: "enabled remains false" }],
        paths: [{ id: "file", value: "src/settings.json" }],
        numbers: [{ id: "retry", value: 4 }],
        suppliedCompletions: ["All 2 workspace tests pass."],
      }],
      {
        toolCalls: [{
          name: "handoff_to_parent",
          input: { message: "Status: COMPLETE. src/settings.json has retryLimit 4; enabled remains false." },
        }],
      },
    );
    expect(outcome.passed).toBe(true);
  });

  it("does not treat a negated test status as a completion claim", () => {
    const outcome = runRequirements(
      "Status: BLOCKED. No fix claimed; tests not passing.",
      [{ id: "facts", kind: "protected-facts", requiredClaims: [{ id: "status", text: "BLOCKED" }] }],
      {},
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts punctuation changes in handoff terms while retaining values", () => {
    const outcome = runRequirements(
      "Handoff complete.",
      [{ id: "handoff", kind: "handoff-message", toolName: "handoff_to_parent", requiredTerms: ["retryLimit 4", "enabled remains false"] }],
      {
        toolCalls: [{ name: "handoff_to_parent", input: { message: "retryLimit: 4; enabled remaining false" } }],
      },
    );
    expect(outcome.passed).toBe(true);
  });

  it("accepts an exact unfinished-work statement as an explicit gap", () => {
    const validation = runRequirements(
      "Load testing remains unfinished.",
      [
        {
          id: "gap",
          kind: "protected-facts",
          hardGroup: "safety",
          knownGaps: [
            { id: "load", description: "Load testing remains unfinished.", mustMark: true },
          ],
        },
      ],
      {},
    );
    expect(validation.passed).toBe(true);
  });

  it("classifies omissions, altered facts, unsupported claims, ordering errors, and unmarked gaps", () => {
    const text = [
      "The Default Timeout Was 30 Seconds before this change.",
      "Plan: verify counts first, then snapshot data, then migrate, then cutover.",
      "I implemented the fix already.",
      "All 12 tests pass in my checkout.",
      "Committed to the repository.",
    ].join(" ");
    const validation = runRequirements(
      text,
      [
        {
          id: "taxonomy",
          kind: "protected-facts",
          hardGroup: "groundedness",
          requiredClaims: [
            { id: "altered-claim", text: "The default timeout was 30 seconds before this change." },
            { id: "minor-claim", text: "Writes are atomic.", critical: false },
            { id: "critical-claim", text: "The retry limit is 3 attempts." },
          ],
          orderedActions: [{ id: "migration-plan", items: ["snapshot", "migrate", "verify counts", "cutover"] }],
          knownGaps: [{ id: "cost-gap", description: "cost figures", mustMark: true }],
        },
      ],
      {},
    );
    const types = validation.checks[0].findings.map((finding) => finding.type);
    expect(types).toContain("critical-omission");
    expect(types).toContain("noncritical-omission");
    expect(types).toContain("altered-fact");
    expect(types).toContain("unsupported-claim");
    expect(types).toContain("ordering-error");
    expect(types).toContain("gap-not-marked");
    expect(validation.checks[0].summary.criticalOmissions).toBeGreaterThanOrEqual(1);
    expect(validation.checks[0].summary.unsupportedClaims).toBeGreaterThanOrEqual(3);
    expect(validation.passed).toBe(false);
  });
});

describe("artifact-usability requirement", () => {
  it("accepts a valid JSON artifact with every required field and rejects unusable ones", () => {
    const good = "Here is the file.\n\n```json\n{\"schemaVersion\": 2, \"service\": \"audit-log\", \"port\": 9430}\n```";
    const passing = runRequirements(
      good,
      [
        {
          id: "usability",
          kind: "artifact-usability",
          artifactType: "json",
          requiredFields: ["schemaVersion", "service", "port"],
          hardGroup: "contract",
          protected: false,
        },
      ],
      {},
    );
    expect(passing.passed).toBe(true);
    expect(passing.checks[0].findings).toEqual([]);

    const invalidJson = "Draft config:\n\n```json\n{ \"schemaVersion\": 2, \"service\": \n```";
    const invalid = runRequirements(
      invalidJson,
      [{ id: "usability", kind: "artifact-usability", artifactType: "json", requiredFields: ["schemaVersion"] }],
      {},
    );
    expect(invalid.passed).toBe(false);
    expect(invalid.checks[0].findings.map((finding) => finding.type)).toContain("invalid-json");

    const missingField = "```json\n{\"schemaVersion\": 2}\n```";
    const missing = runRequirements(
      missingField,
      [{ id: "usability", kind: "artifact-usability", artifactType: "json", requiredFields: ["service"] }],
      {},
    );
    expect(missing.passed).toBe(false);
    expect(missing.checks[0].findings.map((finding) => finding.type)).toContain("missing-field");

    const placeholder = "```json\n{\"service\": \"GAP: service name not supplied\"}\n```";
    const gap = runRequirements(
      placeholder,
      [{ id: "usability", kind: "artifact-usability", artifactType: "json", requiredFields: ["service"] }],
      {},
    );
    expect(gap.passed).toBe(false);
    expect(gap.checks[0].findings.map((finding) => finding.type)).toContain("placeholder-value");

    const fields = runRequirements(
      "Subject: fix(logging): read CONFIG_TIMEOUT_MS\n\nBody: The loader now reads CONFIG_TIMEOUT_MS instead of the fixed default.",
      [{ id: "fields", kind: "artifact-usability", artifactType: "fields", requiredFields: ["Subject:", "Body:"] }],
      {},
    );
    expect(fields.passed).toBe(true);

    const placeholderField = runRequirements(
      "Subject: [GAP: no fix details supplied]\n\nBody: [GAP]",
      [{ id: "fields", kind: "artifact-usability", artifactType: "fields", requiredFields: ["Subject:", "Body:"] }],
      {},
    );
    expect(placeholderField.passed).toBe(false);
    expect(placeholderField.checks[0].findings.map((finding) => finding.type)).toContain("placeholder-field");
  });
});

describe("handoff-message requirement", () => {
  it("requires the named handoff tool call to carry every declared term", () => {
    const toolCalls = [
      {
        name: "handoff_to_subagent",
        input: {
          message:
            "Task: fix the rate limiter in src/rate-limit.ts. Constraint: maximum 100 requests per minute. Do not change the public API.",
        },
      },
    ];
    const passing = runRequirements(
      "Handoff sent.",
      [
        {
          id: "handoff",
          kind: "handoff-message",
          toolName: "handoff_to_subagent",
          requiredTerms: ["src/rate-limit.ts", "maximum 100 requests per minute"],
          hardGroup: "contract",
          protected: true,
        },
      ],
      { toolCalls },
    );
    expect(passing.passed).toBe(true);

    const missing = runRequirements(
      "Handoff sent.",
      [
        {
          id: "handoff",
          kind: "handoff-message",
          toolName: "handoff_to_subagent",
          requiredTerms: ["src/rate-limit.ts", "maximum 100 requests per minute"],
        },
      ],
      {
        toolCalls: [
          { name: "handoff_to_subagent", input: { message: "Fix the rate limiter. Do not change the public API." } },
        ],
      },
    );
    expect(missing.passed).toBe(false);
    const findingTypes = missing.checks[0].findings.map((finding) => finding.type);
    expect(findingTypes).toContain("handoff-term-missing");

    const absent = runRequirements(
      "No tool call happened.",
      [{ id: "handoff", kind: "handoff-message", toolName: "handoff_to_parent", requiredTerms: ["Status: COMPLETE"] }],
      { toolCalls },
    );
    expect(absent.passed).toBe(false);
    expect(absent.checks[0].findings.map((finding) => finding.type)).toContain("handoff-missing");
  });
});

describe("workspace-discipline requirement", () => {
  it("fails a session that skips tests or leaves failed tests without a corrective turn", () => {
    const good = runRequirements(
      "Fixed and verified.",
      [{ id: "discipline", kind: "workspace-discipline", requireTests: true, hardGroup: "correctness" }],
      {
        toolCalls: [{ name: "workspace_run_tests", input: {} }],
        sessionToolMetrics: {
          testsRun: 2,
          failedTestsWithoutCorrectiveTurn: false,
        },
      },
    );
    expect(good.passed).toBe(true);

    const noTests = runRequirements(
      "Fixed without running tests.",
      [{ id: "discipline", kind: "workspace-discipline", requireTests: true }],
      {
        toolCalls: [{ name: "workspace_write", input: { path: "src/millis.ts" } }],
        sessionToolMetrics: { testsRun: 0, failedTestsWithoutCorrectiveTurn: null },
      },
    );
    expect(noTests.passed).toBe(false);
    expect(noTests.checks[0].findings.map((finding) => finding.type)).toContain("tests-not-run");

    const noCorrection = runRequirements(
      "Done.",
      [{ id: "discipline", kind: "workspace-discipline", requireTests: true }],
      {
        toolCalls: [{ name: "workspace_run_tests", input: {} }],
        sessionToolMetrics: { testsRun: 1, failedTestsWithoutCorrectiveTurn: true },
      },
    );
    expect(noCorrection.passed).toBe(false);
    expect(noCorrection.checks[0].findings.map((finding) => finding.type)).toContain(
      "failed-test-without-corrective-turn",
    );

    const noPassingRun = runRequirements(
      "Changed the file after the failing test.",
      [{ id: "discipline", kind: "workspace-discipline", requireTests: true, requirePassingTests: true }],
      {
        toolCalls: [{ name: "workspace_run_tests", input: {} }],
        sessionToolMetrics: {
          testsRun: 1,
          passingTestRuns: 0,
          finalTestRunPassed: false,
          failedTestsWithoutCorrectiveTurn: false,
        },
      },
    );
    expect(noPassingRun.passed).toBe(false);
    expect(noPassingRun.checks[0].findings.map((finding) => finding.type)).toContain(
      "tests-not-passing",
    );
  });
});
