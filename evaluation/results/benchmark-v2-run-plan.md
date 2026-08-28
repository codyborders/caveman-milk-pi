# Benchmark Pilot Run Plan

The regression-v2 pilot completed and failed hard behavior checks. The fresh-v1 pilot has status `NOT RUN` because regression-v2 failed.

## Audit and Deterministic Validation

The pilot-v1 audit contains 45 repeated case rows. It uses immutable pilot-v1 results and regression-v2 requirements. Under-specified cases require grounded clarification. Regression-v2 and fresh-v1 use schema 4 requirements, hard behavior groups, and task-aware compression policies.

Run these deterministic checks before approval.

```bash
npm test
npm run typecheck
npm run evaluate:offline
npm run test:package
npm audit
```

## benchmark-regression-v2

| Setting | Value |
| --- | --- |
| Primary model | `z-ai/glm-5.3` |
| Judge model | `openai-codex/gpt-5.6-sol` |
| Seed | `0xc0ffee03` |
| Process cap | `225` counted attempts |
| Token counting | Disabled |
| Checkpoint | `evaluation/checkpoints/benchmark-regression-v2.json` |
| Output | `evaluation/results/benchmark-regression-v2.json` |
| Status | `FAILED` |

The run used all 225 counted attempts. Primary reported cost was `$0.000000`. Judge reported cost was `$1.904505`.

The report contains 135 results with complete usage. Hard behavior passed 39/45 `off` cases, 37/45 `lite` cases, and 40/45 `full` cases.

The command executed as approved.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=225 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee03 CAVEMAN_EVAL_FIXTURE_SET=benchmark-regression-v2 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=technical-explanation,comparison,negation,ordered-migration,security-warning,irreversible-confirmation,code-generation,file-writing,commit-pr,tool-argument,tutorial,one-line,clarification,wenyan-chinese,wenyan-english CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/benchmark-regression-v2.json CAVEMAN_EVAL_OUTPUT=evaluation/results/benchmark-regression-v2.json npm run evaluate
```

## fresh-v1

| Setting | Value |
| --- | --- |
| Primary model | `z-ai/glm-5.3` |
| Judge model | `openai-codex/gpt-5.6-sol` |
| Seed | `0xc0ffee04` |
| Process cap | `180` counted attempts |
| Token counting | Disabled |
| Checkpoint | `evaluation/checkpoints/fresh-v1.json` |
| Output | `evaluation/results/fresh-v1.json` |
| Status | `NOT RUN` |

Fresh-v1 remains blocked because regression-v2 had hard behavior failures.

This command was not executed.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=180 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee04 CAVEMAN_EVAL_FIXTURE_SET=fresh-v1 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=fresh-short-factual,fresh-explanation,fresh-coding,fresh-steps,fresh-safety,fresh-irreversible,fresh-writing,fresh-artifact,fresh-file,fresh-commit,fresh-pr,fresh-underspecified CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/fresh-v1.json CAVEMAN_EVAL_OUTPUT=evaluation/results/fresh-v1.json npm run evaluate
```

## Execution Note

The regression run started from commit `d0d529bea28a972a6eabee8dcb45fe20b8a9c07d` with one local operational fix. That fix creates a missing checkpoint directory before claiming its sidecar. It does not change prompts, fixtures, model selection, judging, validation, or scoring.

The report records commit `d0d529bea28a972a6eabee8dcb45fe20b8a9c07d`. Reproducing the exact command at that commit requires creating `evaluation/checkpoints/` first. The following commit records automatic directory creation.
