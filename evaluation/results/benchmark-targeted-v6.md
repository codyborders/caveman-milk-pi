# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-4e7a611fecda3d80` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-targeted-v3` |
| Fixture hash | `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee09` |
| Evaluator commit | `efb1ed85ae087f53f42130b7286c87bec280d92c` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `1d5e876a1c3accbe5542eb1b14b5baa8c30dd0ffdf626ff68ca7299d43be0992` |
| Prompt contract hash | `aeaea7ce720c55c3a0a25875c36e86248629941d265282e5a1a18f3cd0b0d4ba` |
| Repetitions | 10 |
| Categories | 4 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 40 | 20 | 36 | 33 | 31 | 34 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 40 | 36 | 39 | 39 | 37 | 40 | 0.9750 | 0.9625 | 0.9916 | 0.5094 | 13 |
| `full` | 40 | 37 | 39 | 39 | 38 | 40 | 0.9844 | 0.9625 | 0.9784 | 0.4757 | 13 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 10,372 | 0 | 8,128 | 18,133 | 36,633 | 0 | +0.0% | n/a |
| `lite` | 2,396 | 0 | 20,224 | 10,088 | 32,708 | -3,925 | -10.7% | n/a |
| `full` | 2,100 | 0 | 20,480 | 10,818 | 33,398 | -3,235 | -8.8% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 1.0480 | 0.5915 | 0.5094 | 13 |
| `full` | 1.1805 | 0.6257 | 0.4757 | 13 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `full` | `negation` | overall | 1 | 4 | 0 | 5 |
| `full` | `negation` | correctness | 1 | 4 | 0 | 5 |
| `full` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `negation` | safety | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | overall | 0 | 6 | 0 | 4 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `full` | `irreversible-confirmation` | safety | 0 | 6 | 0 | 4 |
| `full` | `commit-pr` | overall | 0 | 6 | 2 | 2 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `full` | `commit-pr` | groundedness | 0 | 6 | 1 | 3 |
| `full` | `commit-pr` | user contract | 0 | 5 | 2 | 3 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `full` | `clarification` | overall | 0 | 2 | 0 | 8 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `full` | `clarification` | user contract | 0 | 2 | 0 | 8 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 10 |
| `lite` | `negation` | overall | 1 | 4 | 0 | 5 |
| `lite` | `negation` | correctness | 1 | 4 | 0 | 5 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | overall | 0 | 6 | 0 | 4 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 10 |
| `lite` | `irreversible-confirmation` | safety | 0 | 6 | 0 | 4 |
| `lite` | `commit-pr` | overall | 1 | 6 | 2 | 1 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `commit-pr` | groundedness | 0 | 6 | 1 | 3 |
| `lite` | `commit-pr` | user contract | 1 | 5 | 2 | 2 |
| `lite` | `commit-pr` | safety | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | overall | 0 | 2 | 0 | 8 |
| `lite` | `clarification` | correctness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | groundedness | 0 | 0 | 0 | 10 |
| `lite` | `clarification` | user contract | 0 | 2 | 0 | 8 |
| `lite` | `clarification` | safety | 0 | 0 | 0 | 10 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | $1.348660 |
| Counted process attempts | 200 total (120 primary, 80 judge, 0 count) |
| Assistant model turns | 200 |
| Paid-call cap | 200 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
