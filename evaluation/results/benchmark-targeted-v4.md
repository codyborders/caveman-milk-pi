# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-75a0d6e3e768f268` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-targeted-v3` |
| Fixture hash | `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee07` |
| Evaluator commit | `d9f216f2af8d1df8d433ede8119cc0b5f4e18aa7` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `eebd4b904474b58fe95475b1a081a1ee4026a393b93bb1468db755ad1c0a8147` |
| Prompt contract hash | `1e7bb43691c1d46b76a89209aca010ef413abf93ba48c66c9e647558ccf59b3c` |
| Repetitions | 10 |
| Categories | 4 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 40 | 18 | 34 | 32 | 31 | 35 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 40 | 31 | 40 | 36 | 37 | 35 | 0.9625 | 0.9625 | 0.9114 | 0.6887 | 11 |
| `full` | 40 | 27 | 40 | 32 | 38 | 36 | 0.9750 | 0.9125 | 0.8566 | 0.7883 | 11 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 10,244 | 0 | 8,256 | 20,524 | 39,024 | 0 | +0.0% | n/a |
| `lite` | 2,676 | 0 | 19,904 | 13,192 | 35,772 | -3,252 | -8.3% | n/a |
| `full` | 1,540 | 0 | 21,120 | 12,409 | 35,069 | -3,955 | -10.1% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 1.5905 | 0.5306 | 0.6887 | 11 |
| `full` | 1.4013 | 0.5908 | 0.7883 | 11 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `lite` | `negation` | overall | 0 | 6 | 0 | 4 |
| `lite` | `negation` | correctness | 0 | 6 | 0 | 4 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | overall | 3 | 3 | 2 | 2 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | safety | 3 | 3 | 2 | 2 |
| `lite` | `commit-pr` | overall | 1 | 5 | 3 | 1 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `commit-pr` | groundedness | 1 | 5 | 3 | 1 |
| `lite` | `commit-pr` | user contract | 0 | 3 | 3 | 4 |
| `lite` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | overall | 0 | 3 | 0 | 7 |
| `lite` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | user contract | 0 | 3 | 0 | 7 |
| `lite` | `clarification` | safety | 0 | 0 | 0 | 10 |
| `full` | `negation` | overall | 0 | 6 | 0 | 4 |
| `full` | `negation` | correctness | 0 | 6 | 0 | 4 |
| `full` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `negation` | safety | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | overall | 1 | 2 | 3 | 4 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | safety | 1 | 2 | 3 | 4 |
| `full` | `commit-pr` | overall | 2 | 2 | 6 | 0 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `full` | `commit-pr` | groundedness | 2 | 2 | 6 | 0 |
| `full` | `commit-pr` | user contract | 0 | 5 | 1 | 4 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `full` | `clarification` | overall | 0 | 2 | 1 | 7 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | user contract | 0 | 2 | 1 | 7 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 10 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | $1.416990 |
| Counted process attempts | 200 total (120 primary, 80 judge, 0 count) |
| Assistant model turns | 200 |
| Paid-call cap | 200 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
