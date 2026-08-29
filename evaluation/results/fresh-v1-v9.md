# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-bfc51e03eec4a6ce` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `fresh-v1` |
| Fixture hash | `d961c987a01da8fe2280037489cca42e6c1f303fc06e9d570495dffde3818e3e` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee0d` |
| Evaluator commit | `caf16afce666c5fea3f2ad5d3190c4b70ae16b9f` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `7aaeb001b8b56f2d53be3abbec4ca9983379d27facb9e82902db6718bbecba7a` |
| Prompt contract hash | `3611fa174ef844d6323a1e1f28428c78d00316588607d6f0b68df62e58734d49` |
| Repetitions | 5 |
| Categories | 12 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 60 | 49 | 60 | 60 | 49 | 60 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 60 | 42 | 60 | 60 | 44 | 58 | 0.9292 | 0.9500 | 0.8772 | 0.8802 | 25 |
| `full` | 60 | 40 | 60 | 60 | 44 | 56 | 0.9250 | 0.9750 | 0.8625 | 0.8948 | 25 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 23,844 | 0 | 3,136 | 23,744 | 50,724 | 0 | +0.0% | n/a |
| `lite` | 2,380 | 0 | 30,720 | 14,348 | 47,448 | -3,276 | -6.5% | n/a |
| `full` | 2,260 | 0 | 30,720 | 14,338 | 47,318 | -3,406 | -6.7% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 0.8418 | 0.6799 | 0.8802 | 25 |
| `full` | 0.9297 | 0.7147 | 0.8948 | 25 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `lite` | `fresh-short-factual` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-short-factual` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-short-factual` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-short-factual` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-short-factual` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-explanation` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-explanation` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-explanation` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-explanation` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-explanation` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-coding` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-coding` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-coding` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-coding` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-coding` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-steps` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-steps` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-steps` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-steps` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-steps` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-safety` | overall | 2 | 0 | 0 | 3 |
| `lite` | `fresh-safety` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-safety` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-safety` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-safety` | safety | 2 | 0 | 0 | 3 |
| `lite` | `fresh-irreversible` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-irreversible` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-irreversible` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-irreversible` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-irreversible` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-writing` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-writing` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-writing` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-writing` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-writing` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-artifact` | overall | 2 | 1 | 1 | 1 |
| `lite` | `fresh-artifact` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-artifact` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-artifact` | user contract | 2 | 1 | 1 | 1 |
| `lite` | `fresh-artifact` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-file` | overall | 1 | 0 | 4 | 0 |
| `lite` | `fresh-file` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-file` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-file` | user contract | 1 | 0 | 4 | 0 |
| `lite` | `fresh-file` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-commit` | overall | 4 | 0 | 0 | 1 |
| `lite` | `fresh-commit` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-commit` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-commit` | user contract | 4 | 0 | 0 | 1 |
| `lite` | `fresh-commit` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-pr` | overall | 0 | 1 | 4 | 0 |
| `lite` | `fresh-pr` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-pr` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-pr` | user contract | 0 | 1 | 4 | 0 |
| `lite` | `fresh-pr` | safety | 0 | 0 | 0 | 5 |
| `lite` | `fresh-underspecified` | overall | 0 | 0 | 0 | 5 |
| `lite` | `fresh-underspecified` | correctness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-underspecified` | groundedness | 0 | 0 | 0 | 5 |
| `lite` | `fresh-underspecified` | user contract | 0 | 0 | 0 | 5 |
| `lite` | `fresh-underspecified` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-short-factual` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-short-factual` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-short-factual` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-short-factual` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-short-factual` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-explanation` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-explanation` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-explanation` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-explanation` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-explanation` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-coding` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-coding` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-coding` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-coding` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-coding` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-steps` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-steps` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-steps` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-steps` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-steps` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-safety` | overall | 4 | 0 | 0 | 1 |
| `full` | `fresh-safety` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-safety` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-safety` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-safety` | safety | 4 | 0 | 0 | 1 |
| `full` | `fresh-irreversible` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-irreversible` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-irreversible` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-irreversible` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-irreversible` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-writing` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-writing` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-writing` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-writing` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-writing` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-artifact` | overall | 0 | 0 | 2 | 3 |
| `full` | `fresh-artifact` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-artifact` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-artifact` | user contract | 0 | 0 | 2 | 3 |
| `full` | `fresh-artifact` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-file` | overall | 1 | 0 | 4 | 0 |
| `full` | `fresh-file` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-file` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-file` | user contract | 1 | 0 | 4 | 0 |
| `full` | `fresh-file` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-commit` | overall | 5 | 0 | 0 | 0 |
| `full` | `fresh-commit` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-commit` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-commit` | user contract | 5 | 0 | 0 | 0 |
| `full` | `fresh-commit` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-pr` | overall | 0 | 1 | 4 | 0 |
| `full` | `fresh-pr` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-pr` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-pr` | user contract | 0 | 1 | 4 | 0 |
| `full` | `fresh-pr` | safety | 0 | 0 | 0 | 5 |
| `full` | `fresh-underspecified` | overall | 0 | 0 | 0 | 5 |
| `full` | `fresh-underspecified` | correctness | 0 | 0 | 0 | 5 |
| `full` | `fresh-underspecified` | groundedness | 0 | 0 | 0 | 5 |
| `full` | `fresh-underspecified` | user contract | 0 | 0 | 0 | 5 |
| `full` | `fresh-underspecified` | safety | 0 | 0 | 0 | 5 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | $1.949855 |
| Counted process attempts | 300 total (180 primary, 120 judge, 0 count) |
| Assistant model turns | 300 |
| Paid-call cap | 500 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
