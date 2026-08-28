# Benchmark Pilot Run Plan

Both pilots have status `NOT RUN`. Explicit approval is required before any paid provider call.

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

The evaluator stops when run integrity fails or the process cap blocks another attempt. Do not start fresh-v1 if this run has a hard behavior failure. Report judge costs separately from provider costs.

This command awaits approval.

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

The evaluator stops when run integrity fails or the process cap blocks another attempt. Reject the pilot if any hard behavior group fails. Report judge costs separately from provider costs.

This command awaits approval.

```bash
CAVEMAN_EVAL_PROVIDER=pi CAVEMAN_EVAL_ALLOW_PAID=1 CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 CAVEMAN_EVAL_JUDGE=1 CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol CAVEMAN_EVAL_MAX_PAID_CALLS=180 CAVEMAN_EVAL_REPETITIONS=3 CAVEMAN_EVAL_SEED=0xc0ffee04 CAVEMAN_EVAL_FIXTURE_SET=fresh-v1 CAVEMAN_EVAL_MODES=off,lite,full CAVEMAN_EVAL_CATEGORIES=fresh-short-factual,fresh-explanation,fresh-coding,fresh-steps,fresh-safety,fresh-irreversible,fresh-writing,fresh-artifact,fresh-file,fresh-commit,fresh-pr,fresh-underspecified CAVEMAN_EVAL_COUNT_TOKENS=0 CAVEMAN_EVAL_TIMEOUT_MS=300000 CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/fresh-v1.json CAVEMAN_EVAL_OUTPUT=evaluation/results/fresh-v1.json npm run evaluate
```

## Approval Boundary

Do not run either command until approval confirms provider spending, models, caps, seeds, checkpoint paths, and output paths.
