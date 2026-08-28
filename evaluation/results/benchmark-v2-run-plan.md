# Benchmark Pilot Run Plan

The paid benchmark-regression-v2 pilot used prompt contract v2 and failed hard behavior checks. The corrected offline rescore applies validator v3 without model calls. The current prompt contract v3 remains untested. The fresh-v1 holdout has status `NOT RUN` because regression-v2 failed.

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

The command executed as approved. Its immutable SHA-256 is `0e4a254968b0448b2df9e707d04c6bbc7c760c1b3b4a9dfb3ea07cfe6409feeb`.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=225 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee03 CAVEMAN_EVAL_FIXTURE_SET=benchmark-regression-v2 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=technical-explanation,comparison,negation,ordered-migration,security-warning,irreversible-confirmation,code-generation,file-writing,commit-pr,tool-argument,tutorial,one-line,clarification,wenyan-chinese,wenyan-english CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/benchmark-regression-v2.json CAVEMAN_EVAL_OUTPUT=evaluation/results/benchmark-regression-v2.json npm run evaluate
```

## Offline Rescore

The offline rescore verifies the immutable report and locked source fixture. It reuses stored model output, usage, tool calls, and judge results. It applies corrected validators and pair attribution without starting Pi or a provider.

```bash
npm run rescore:offline
```

The command writes `evaluation/results/benchmark-regression-v2-rescored.json` and its Markdown summary. It does not replace the paid report. No new paid calls were made.

The rescored JSON SHA-256 is `bf96ad9fa33c1bc28d7261c01957d9618a0567a02729e0a04c23953266efd77a`. The original and rescored conclusions both fail. Rescored hard behavior passed 41/45 `off` cases, 37/45 `lite` cases, and 41/45 `full` cases. The committed evaluator revision is `8df10874a8b8b5e93508884c652bd51abcc3eedb`.

The rescore retains two clear `lite` negation regressions and two clear `full` confirmation regressions. Commit and PR failures also occur in `off`. Corrected casing removes several clarification failures, but one `lite` paired regression remains.

## Future Targeted Paid Rerun

This prepared command covers only four changed behavioral areas. It was not executed. It needs separate approval before execution. The cap allows 36 primary processes and 24 judge processes.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=60 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee05 CAVEMAN_EVAL_FIXTURE_SET=benchmark-regression-v2 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=negation,irreversible-confirmation,commit-pr,clarification CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/benchmark-targeted-v2.json CAVEMAN_EVAL_OUTPUT=evaluation/results/benchmark-targeted-v2.json npm run evaluate
```

## fresh-v1 Holdout

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

Fresh-v1 remains blocked because regression-v2 had hard behavior failures. This prepared 180-call holdout command was not executed. It remains the release gate after regression-v2 passes.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=180 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee04 CAVEMAN_EVAL_FIXTURE_SET=fresh-v1 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=fresh-short-factual,fresh-explanation,fresh-coding,fresh-steps,fresh-safety,fresh-irreversible,fresh-writing,fresh-artifact,fresh-file,fresh-commit,fresh-pr,fresh-underspecified CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/fresh-v1.json CAVEMAN_EVAL_OUTPUT=evaluation/results/fresh-v1.json npm run evaluate
```

## Execution Note

The regression run started from commit `d0d529bea28a972a6eabee8dcb45fe20b8a9c07d` with one local operational fix. That fix creates a missing checkpoint directory before claiming its sidecar. It does not change prompts, fixtures, model selection, judging, validation, or scoring.

The report records commit `d0d529bea28a972a6eabee8dcb45fe20b8a9c07d`. Reproducing the exact command at that commit requires creating `evaluation/checkpoints/` first. The following commit records automatic directory creation.
