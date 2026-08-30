# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-a0eddb69818eb334` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-targeted-v3` |
| Fixture hash | `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee0a` |
| Evaluator commit | `b6a191d4f4b3694e35e3f89ee288a2ebf08d19bc` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `8a5928323e0789ac6d1bca866306030fb0f3bcac98543e904eb656bc28d2d8a5` |
| Prompt contract hash | `d29ec347edbba3a102e7fed1e28d5b90b7fce63758bb04892a933ede06a9f01c` |
| Repetitions | 10 |
| Categories | 4 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 40 | 17 | 34 | 31 | 32 | 35 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 40 | 33 | 36 | 39 | 38 | 40 | 0.9437 | 0.9938 | 0.9426 | 0.7165 | 9 |
| `full` | 40 | 34 | 40 | 38 | 35 | 40 | 0.9938 | 0.9875 | 0.8951 | 0.6690 | 9 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 10,436 | 0 | 8,064 | 21,935 | 40,435 | 0 | +0.0% | n/a |
| `lite` | 1,756 | 0 | 20,864 | 11,766 | 34,386 | -6,049 | -15.0% | n/a |
| `full` | 2,316 | 0 | 20,224 | 11,849 | 34,389 | -6,046 | -15.0% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 1.0579 | 0.5049 | 0.7165 | 9 |
| `full` | 1.2906 | 0.6307 | 0.6690 | 9 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `lite` | `negation` | overall | 2 | 4 | 2 | 2 |
| `lite` | `negation` | correctness | 2 | 4 | 2 | 2 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | overall | 0 | 5 | 0 | 5 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | safety | 0 | 5 | 0 | 5 |
| `lite` | `commit-pr` | overall | 0 | 6 | 3 | 1 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `commit-pr` | groundedness | 0 | 8 | 1 | 1 |
| `lite` | `commit-pr` | user contract | 1 | 4 | 1 | 4 |
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
| `full` | `irreversible-confirmation` | overall | 0 | 5 | 0 | 5 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | safety | 0 | 5 | 0 | 5 |
| `full` | `commit-pr` | overall | 0 | 5 | 4 | 1 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `full` | `commit-pr` | groundedness | 0 | 7 | 2 | 1 |
| `full` | `commit-pr` | user contract | 2 | 4 | 1 | 3 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `full` | `clarification` | overall | 2 | 3 | 0 | 5 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | user contract | 2 | 3 | 0 | 5 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 10 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | $1.399110 |
| Counted process attempts | 200 total (120 primary, 80 judge, 0 count) |
| Assistant model turns | 200 |
| Paid-call cap | 200 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
