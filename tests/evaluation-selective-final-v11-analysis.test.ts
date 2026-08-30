import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_SAMPLES,
  buildSelectiveFinalAnalysis,
  pairedBootstrap,
  renderSelectiveFinalAnalysis,
} from "../scripts/eval/selective-final-v11-analysis.mjs";

function result({
  mode,
  category,
  repetition,
  nested = false,
  total = mode === "off" ? 100 : 80,
  elapsedMs = mode === "off" ? 1000 : 800,
  findings = [],
}: {
  mode: "off" | "selective-final-v11";
  category: string;
  repetition: number;
  nested?: boolean;
  total?: number;
  elapsedMs?: number;
  findings?: Array<{ type: string }>;
}) {
  const root = { input: total - 20, cacheRead: 0, cacheWrite: 0, output: 10 };
  const childUsage = { input: 5, cacheRead: 0, cacheWrite: 0, output: 2 };
  const finalizer = { input: 2, cacheRead: 0, cacheWrite: 0, output: 3 };
  root.input -= nested ? 2 : 0;
  return {
    mode,
    category,
    repetition,
    response: "complete",
    elapsedMs,
    usage: root,
    behavioralPassed: true,
    validation: { passed: true, checks: [] },
    preservation: { findings },
    nested: nested
      ? {
          complete: true,
          rootMode: "off",
          childCount: 1,
          children: [{ usage: childUsage, responseText: "complete", mode: "off" }],
        }
      : null,
    finalizer: {
      mode: "off",
      arm: mode,
      injectedCandidateNodes: mode === "off" ? 0 : 1,
      injectedPromptCharacters: mode === "off" ? 0 : 822,
      tools: [],
      usage: finalizer,
      elapsedMs: 100,
      text: "complete",
    },
    judge: { activeQualityTotal: 8, offQualityTotal: 8, notes: "tie" },
  };
}

function run(condition: "cold" | "warm", critical = false) {
  const results = [];
  const make = (options: Parameters<typeof result>[0]) => {
    const value = result(options);
    if (condition === "warm") {
      value.usage.cacheRead = 1;
      if (value.nested !== null) value.nested.children[0].usage.cacheRead = 1;
      value.finalizer.usage.cacheRead = 1;
    }
    return value;
  };
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    results.push(make({ mode: "off", category: "direct", repetition }));
    results.push(
      make({
        mode: "selective-final-v11",
        category: "direct",
        repetition,
        findings: critical && repetition === 1 ? [{ type: "missing-warning" }] : [],
      }),
    );
    results.push(make({ mode: "off", category: "nested", repetition, nested: true }));
    results.push(
      make({ mode: "selective-final-v11", category: "nested", repetition, nested: true }),
    );
  }
  return { condition, rawPath: `${condition}.json`, report: { results } };
}

describe("selective-final analysis", () => {
  it("uses deterministic paired bootstrap sample count", () => {
    expect(BOOTSTRAP_SAMPLES).toBe(20000);
    expect(pairedBootstrap([{ value: 1 }, { value: 3 }], (pair) => pair.value, 20, 4).samples).toBe(20);
  });

  it("applies complete-tree gates and records finalizer-only injection", () => {
    const analysis = buildSelectiveFinalAnalysis({ runs: [run("cold"), run("warm")] });
    expect(analysis.conditions.cold.successfulPairs).toBe(6);
    expect(analysis.conditions.cold).not.toHaveProperty("pairs");
    expect(analysis.deploymentMix.totalTokens.upper95).toBeLessThan(0);
    expect(analysis.deploymentMix.endToEndLatencyMs.upper95).toBeLessThan(0);
    expect(analysis.taskSuccess.nested.lower95).toBeGreaterThanOrEqual(0);
    expect(analysis.taskSuccess.nested.candidateSuccessRate).toBe(1);
    expect(analysis.taskSuccess.direct.pairCount).toBe(6);
    expect(analysis.taskSuccess.nested.pairCount).toBe(6);
    expect(analysis.injectionAudit).toMatchObject({
      offInjectedNodes: 0,
      candidateInjectedNodes: 12,
      candidateNonFinalizerInjectedNodes: 0,
    });
    expect(analysis.finalDecision).toMatchObject({ passed: true, defaultMode: "selective-final-v11" });
    const markdown = renderSelectiveFinalAnalysis(analysis);
    expect(markdown).toContain("| Cold | 6 | 6 |");
    expect(markdown).toContain("| Direct | 6 | 6 | 6 |");
    expect(markdown).toContain("| Total-token reduction | PASS |");
    expect(markdown).toContain("Candidate injections outside finalizers: 0");
  });

  it("separates inter-agent findings from final-response findings", () => {
    const cold = run("cold");
    const candidateNested = cold.report.results.find(
      (entry) => entry.mode === "selective-final-v11" && entry.category === "nested",
    );
    candidateNested.preservation.findings.push({ type: "child-handoff-term-missing" });
    candidateNested.validation.checks.push({ id: "delegation", passed: false });
    const analysis = buildSelectiveFinalAnalysis({ runs: [cold, run("warm")] });
    expect(analysis.preservation.totalCriticalFindings).toBe(0);
    expect(analysis.preservation.taskImpactingHandoffLosses).toBe(1);
  });

  it("keeps off when one critical final-response finding remains", () => {
    const analysis = buildSelectiveFinalAnalysis({
      runs: [run("cold", true), run("warm")],
    });
    expect(analysis.preservation.totalCriticalFindings).toBe(1);
    expect(analysis.finalDecision.gates.preservation).toBe(false);
    expect(analysis.finalDecision.defaultMode).toBe("off");
  });
});
