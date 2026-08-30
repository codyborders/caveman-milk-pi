# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-322b856995f5ed8e` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-targeted-v3` |
| Fixture hash | `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee08` |
| Evaluator commit | `4191446d28c6e11d202badff49dfb665b665f0b4` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `41100382a09ad74f23ab3fd9a95ebfb36c22333b459949de71439075ebb65372` |
| Prompt contract hash | `01fc92b7cc2648cd1795fbc3dfeb0d7f82afdea39e0969ded8552d3f0aeb87be` |
| Repetitions | 10 |
| Categories | 4 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 40 | 15 | 34 | 30 | 33 | 35 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 40 | 32 | 37 | 36 | 38 | 40 | 0.9437 | 0.9625 | 0.9922 | 0.4974 | 9 |
| `full` | 40 | 35 | 40 | 36 | 37 | 40 | 0.9750 | 0.9500 | 0.9223 | 0.4777 | 10 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 11,268 | 0 | 7,232 | 20,475 | 38,975 | 0 | +0.0% | n/a |
| `lite` | 2,060 | 0 | 20,480 | 10,980 | 33,520 | -5,455 | -14.0% | n/a |
| `full` | 1,380 | 0 | 21,120 | 10,779 | 33,279 | -5,696 | -14.6% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 0.9240 | 0.5505 | 0.4974 | 9 |
| `full` | 1.1316 | 0.5836 | 0.4777 | 10 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `lite` | `negation` | overall | 1 | 4 | 2 | 3 |
| `lite` | `negation` | correctness | 1 | 4 | 2 | 3 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | overall | 0 | 5 | 0 | 5 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | safety | 0 | 5 | 0 | 5 |
| `lite` | `commit-pr` | overall | 0 | 6 | 4 | 0 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `commit-pr` | groundedness | 0 | 6 | 4 | 0 |
| `lite` | `commit-pr` | user contract | 1 | 3 | 0 | 6 |
| `lite` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | overall | 0 | 3 | 1 | 6 |
| `lite` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | user contract | 0 | 3 | 1 | 6 |
| `lite` | `clarification` | safety | 0 | 0 | 0 | 10 |
| `full` | `negation` | overall | 0 | 6 | 0 | 4 |
| `full` | `negation` | correctness | 0 | 6 | 0 | 4 |
| `full` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `negation` | safety | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | overall | 0 | 5 | 0 | 5 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | safety | 0 | 5 | 0 | 5 |
| `full` | `commit-pr` | overall | 0 | 6 | 4 | 0 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `full` | `commit-pr` | groundedness | 0 | 6 | 4 | 0 |
| `full` | `commit-pr` | user contract | 1 | 2 | 1 | 6 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `full` | `clarification` | overall | 0 | 3 | 1 | 6 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | user contract | 0 | 3 | 1 | 6 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 10 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | $1.433975 |
| Counted process attempts | 200 total (120 primary, 80 judge, 0 count) |
| Assistant model turns | 200 |
| Paid-call cap | 200 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
