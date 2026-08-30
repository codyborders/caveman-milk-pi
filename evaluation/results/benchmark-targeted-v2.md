# Targeted Regression v2 Result

## Verdict

The targeted regression failed. Every mode had at least two hard-behavior failures. The `fresh-v1` holdout remains blocked, and mode `off` remains the default.

The run completed without provider or judge process failures. Usage is complete for every primary result and judge result. These operational checks do not override the behavioral failure.

## Run identity

| Field | Value |
| --- | --- |
| Evaluated commit | `7ba69f5b84854275af2929f8e73a61c97e950eb5` |
| Run ID | `caveman-eval-0cf9a9442c002076` |
| Fixture set | `benchmark-regression-v2` |
| Fixture hash | `eec0f664fd4d94c653c532fda4b0293dba7b0b6471e6778489069a63c31fdfda` |
| Source fixture file SHA-256 | `da6ff6b621fa512301c954cc94850ca7a1ff3873766302c97ad69ec1cd4d0adb` |
| Prompt contract | v3 |
| Validator | `schema4-corrected-v3` |
| Seed | `0xc0ffee05` |
| Primary model | `z-ai/glm-5.3` |
| Judge model | `openai-codex/gpt-5.6-sol` |
| Result report SHA-256 | `02585e808fc15e553f754a169d6b4f0d5bb7bdbda4fc952abbf88908d8ffd3dd` |

## Command

```bash
CAVEMAN_EVAL_PROVIDER=pi \
CAVEMAN_EVAL_ALLOW_PAID=1 \
CAVEMAN_EVAL_MODEL=z-ai/glm-5.3 \
CAVEMAN_EVAL_JUDGE=1 \
CAVEMAN_EVAL_JUDGE_MODEL=openai-codex/gpt-5.6-sol \
CAVEMAN_EVAL_MAX_PAID_CALLS=60 \
CAVEMAN_EVAL_REPETITIONS=3 \
CAVEMAN_EVAL_SEED=0xc0ffee05 \
CAVEMAN_EVAL_FIXTURE_SET=benchmark-regression-v2 \
CAVEMAN_EVAL_MODES=off,lite,full \
CAVEMAN_EVAL_CATEGORIES=negation,irreversible-confirmation,commit-pr,clarification \
CAVEMAN_EVAL_COUNT_TOKENS=0 \
CAVEMAN_EVAL_TIMEOUT_MS=300000 \
CAVEMAN_EVAL_CHECKPOINT=evaluation/checkpoints/benchmark-targeted-v2.json \
CAVEMAN_EVAL_OUTPUT=evaluation/results/benchmark-targeted-v2.json \
npm run evaluate
```

## Process accounting

| Process type | Planned | Actual |
| --- | ---: | ---: |
| Primary | 36 | 36 |
| Judge | 24 | 24 |
| Count endpoint | 0 | 0 |
| Total | 60 | 60 |

The report contains 36 cases. `failures` is empty, `judgeFailures` is zero, and `primaryUsageComplete` is true.

## Hard behavior

| Mode | Negation | Confirmation | Commit and PR | Clarification | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `off` | 1/3 | 3/3 | 2/3 | 2/3 | 8/12 |
| `lite` | 3/3 | 2/3 | 2/3 | 3/3 | 10/12 |
| `full` | 3/3 | 2/3 | 2/3 | 3/3 | 10/12 |

The failed cases were `off` negation repetitions 1 and 3, `off` commit and PR repetition 1, and `off` clarification repetition 1. Both active modes failed commit and PR repetition 2. Both active modes also failed confirmation repetition 3.

The expected result was 12/12 in every mode. None met that requirement.

## Judge quality deltas

Each entry is active score minus paired `off` score for repetitions 1, 2, and 3.

| Mode | Category | Repetition deltas |
| --- | --- | --- |
| `lite` | Negation | `+4, +2, +5` |
| `lite` | Confirmation | `0, 0, 0` |
| `lite` | Commit and PR | `+6, +1, +1` |
| `lite` | Clarification | `+4, -2, -1` |
| `full` | Negation | `+4, +3, +5` |
| `full` | Confirmation | `0, 0, 0` |
| `full` | Commit and PR | `+1, -6, +1` |
| `full` | Clarification | `+6, 0, 0` |

`lite` recorded seven wins, three ties, and two losses. `full` recorded six wins, five ties, and one loss.

## Usage and recorded cost

| Process group | Input | Cache write | Cache read | Output | Latency | Assistant turns | Recorded cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Primary | 8,165 | 0 | 11,008 | 13,428 | 267,194 ms | 36 | `$0.000000` |
| Judge | 33,869 | 0 | 0 | 15,337 | Not recorded | 24 | `$0.629455` |
| Combined | 42,034 | 0 | 11,008 | 28,765 | Not available | 60 | `$0.629455` |

Primary and judge raw usage fields are complete. Judge process latency is not stored, so a combined latency total is unavailable. The report has `pricing: null`. The primary model has no priced total in this report, so the recorded zero must not be treated as a complete monetary cost.

## Compression

Compression includes only pairs where both arms passed hard behavior, the policy permits compression, and usage is valid.

| Mode | Eligible pairs | Hard-failure exclusions | Policy exclusions | Invalid-usage exclusions | Mean ratio | Median ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `lite` | 3/12 | 6 | 3 | 0 | 0.528991 | 0.474522 |
| `full` | 3/12 | 6 | 3 | 0 | 0.365864 | 0.248969 |

For each active mode, eligible pairs were negation repetition 2 and clarification repetitions 2 and 3. Confirmation and commit/PR categories remain outside compression claims under their policies. Failed pairs are classified as hard failures before policy exclusion.

## Final status

The capped targeted regression did not correct all known regressions. Hard-behavior failure blocks the 180-call holdout, any higher cap, and release work. This result authorizes no additional paid run.