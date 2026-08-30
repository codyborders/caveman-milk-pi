# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-59eaf4cf4da94a36` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-targeted-v4` |
| Fixture hash | `c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de` |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee0b` |
| Evaluator commit | `794dccfb93a2f21173275d08908fff18ccd242cc` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `7aaeb001b8b56f2d53be3abbec4ca9983379d27facb9e82902db6718bbecba7a` |
| Prompt contract hash | `3611fa174ef844d6323a1e1f28428c78d00316588607d6f0b68df62e58734d49` |
| Repetitions | 3 |
| Categories | 4 |
| Judge | disabled |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 12 | 12 | 12 | 12 | 12 | 12 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 12 | 12 | 12 | 12 | 12 | 12 | n/a | n/a | 0.9753 | 0.6397 | 6 |
| `full` | 12 | 11 | 12 | 12 | 11 | 12 | n/a | n/a | 0.8977 | 0.7090 | 6 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 1,802 | 0 | 4,096 | 2,527 | 8,425 | 0 | +0.0% | n/a |
| `lite` | 1,234 | 0 | 5,888 | 1,563 | 8,685 | 260 | +3.1% | n/a |
| `full` | 1,466 | 0 | 5,632 | 1,501 | 8,599 | 174 | +2.1% | n/a |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 0.7217 | 0.7262 | 0.6397 | 6 |
| `full` | 0.7193 | 0.6804 | 0.7090 | 6 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `lite` | `negation` | overall | 0 | 0 | 0 | 3 |
| `lite` | `negation` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | overall | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | overall | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | safety | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | overall | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | safety | 0 | 0 | 0 | 3 |
| `full` | `negation` | overall | 0 | 0 | 0 | 3 |
| `full` | `negation` | correctness | 0 | 0 | 0 | 3 |
| `full` | `negation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `negation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `negation` | safety | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | overall | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | safety | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | overall | 1 | 0 | 0 | 2 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | user contract | 1 | 0 | 0 | 2 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 3 |
| `full` | `clarification` | overall | 0 | 0 | 0 | 3 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 3 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `clarification` | user contract | 0 | 0 | 0 | 3 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 3 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | n/a |
| Judge cost, separate | n/a |
| Counted process attempts | 36 total (36 primary, 0 judge, 0 count) |
| Assistant model turns | 36 |
| Paid-call cap | 36 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
