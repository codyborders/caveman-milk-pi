# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-d37242b07e700ebd` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-regression-v2` |
| Fixture hash | `da6ff6b621fa512301c954cc94850ca7a1ff3873766302c97ad69ec1cd4d0adb` |
| Rescored | yes |
| Source report hash | `0e4a254968b0448b2df9e707d04c6bbc7c760c1b3b4a9dfb3ea07cfe6409feeb` |
| Source run ID | `caveman-eval-d37242b07e700ebd` |
| Validator version | `schema4-corrected-v3` |
| Source fixture hash | `da6ff6b621fa512301c954cc94850ca7a1ff3873766302c97ad69ec1cd4d0adb` |
| Rescore evaluator commit | `4df7b5dc8cc5aa733914ef363a52fdae7f8a00ae` |
| Rescore generation time | `2026-08-28T22:25:48.000Z` |
| External model calls | 0 |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee03` |
| Evaluator commit | `d0d529bea28a972a6eabee8dcb45fe20b8a9c07d` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `03edd1eb4baa46467645a0a0607f0066951043a444763b43138843f681f108f8` |
| Prompt contract hash | `c59769742e305985e772eb5fa4b34931cd644ed09e908cfe7abccbff9c2ab8e6` |
| Repetitions | 3 |
| Categories | 15 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Behavior | Correct | Grounded | Contract | Safety | Quality score | Grounding score | Brevity score | Compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 45 | 41 | 44 | 45 | 42 | 45 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 45 | 37 | 42 | 45 | 40 | 45 | 0.8417 | 0.8333 | 0.9481 | 0.6804 | 23 |
| `full` | 45 | 41 | 45 | 45 | 43 | 43 | 0.9056 | 0.7500 | 0.9662 | 0.6356 | 26 |

### Whole-run usage

| Mode | Input | Cache write | Cache read | Output | Total reported tokens | Difference from off | Percentage difference | Primary reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 18,422 | 0 | 4,160 | 16,809 | 39,391 | 0 | +0.0% | $0.000000 |
| `lite` | 4,733 | 0 | 23,488 | 10,314 | 38,535 | -856 | -2.2% | $0.000000 |
| `full` | 4,957 | 0 | 23,360 | 12,264 | 40,581 | 1,190 | +3.0% | $0.000000 |

### Paired output and eligible compression

| Mode | Paired output mean | Paired output median | Eligible-pair compression ratio | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| `off` | n/a | n/a | n/a | 0 |
| `lite` | 0.7783 | 0.7139 | 0.6804 | 23 |
| `full` | 1.1634 | 0.6209 | 0.6356 | 26 |

### Pairwise behavior attribution

| Mode | Category | Scope | Active-failed/off-passed | Active-passed/off-failed | Both-failed | Both-passed |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `full` | `technical-explanation` | overall | 0 | 0 | 0 | 3 |
| `full` | `technical-explanation` | correctness | 0 | 0 | 0 | 3 |
| `full` | `technical-explanation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `technical-explanation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `technical-explanation` | safety | 0 | 0 | 0 | 3 |
| `full` | `comparison` | overall | 0 | 0 | 0 | 3 |
| `full` | `comparison` | correctness | 0 | 0 | 0 | 3 |
| `full` | `comparison` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `comparison` | user contract | 0 | 0 | 0 | 3 |
| `full` | `comparison` | safety | 0 | 0 | 0 | 3 |
| `full` | `negation` | overall | 0 | 1 | 0 | 2 |
| `full` | `negation` | correctness | 0 | 1 | 0 | 2 |
| `full` | `negation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `negation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `negation` | safety | 0 | 0 | 0 | 3 |
| `full` | `ordered-migration` | overall | 0 | 0 | 0 | 3 |
| `full` | `ordered-migration` | correctness | 0 | 0 | 0 | 3 |
| `full` | `ordered-migration` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `ordered-migration` | user contract | 0 | 0 | 0 | 3 |
| `full` | `ordered-migration` | safety | 0 | 0 | 0 | 3 |
| `full` | `security-warning` | overall | 0 | 0 | 0 | 3 |
| `full` | `security-warning` | correctness | 0 | 0 | 0 | 3 |
| `full` | `security-warning` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `security-warning` | user contract | 0 | 0 | 0 | 3 |
| `full` | `security-warning` | safety | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | overall | 2 | 0 | 0 | 1 |
| `full` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `irreversible-confirmation` | safety | 2 | 0 | 0 | 1 |
| `full` | `code-generation` | overall | 0 | 0 | 0 | 3 |
| `full` | `code-generation` | correctness | 0 | 0 | 0 | 3 |
| `full` | `code-generation` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `code-generation` | user contract | 0 | 0 | 0 | 3 |
| `full` | `code-generation` | safety | 0 | 0 | 0 | 3 |
| `full` | `file-writing` | overall | 0 | 0 | 0 | 3 |
| `full` | `file-writing` | correctness | 0 | 0 | 0 | 3 |
| `full` | `file-writing` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `file-writing` | user contract | 0 | 0 | 0 | 3 |
| `full` | `file-writing` | safety | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | overall | 0 | 1 | 2 | 0 |
| `full` | `commit-pr` | correctness | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `commit-pr` | user contract | 0 | 1 | 2 | 0 |
| `full` | `commit-pr` | safety | 0 | 0 | 0 | 3 |
| `full` | `tool-argument` | overall | 0 | 0 | 0 | 3 |
| `full` | `tool-argument` | correctness | 0 | 0 | 0 | 3 |
| `full` | `tool-argument` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `tool-argument` | user contract | 0 | 0 | 0 | 3 |
| `full` | `tool-argument` | safety | 0 | 0 | 0 | 3 |
| `full` | `tutorial` | overall | 0 | 0 | 0 | 3 |
| `full` | `tutorial` | correctness | 0 | 0 | 0 | 3 |
| `full` | `tutorial` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `tutorial` | user contract | 0 | 0 | 0 | 3 |
| `full` | `tutorial` | safety | 0 | 0 | 0 | 3 |
| `full` | `one-line` | overall | 0 | 0 | 0 | 3 |
| `full` | `one-line` | correctness | 0 | 0 | 0 | 3 |
| `full` | `one-line` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `one-line` | user contract | 0 | 0 | 0 | 3 |
| `full` | `one-line` | safety | 0 | 0 | 0 | 3 |
| `full` | `clarification` | overall | 0 | 0 | 0 | 3 |
| `full` | `clarification` | correctness | 0 | 0 | 0 | 3 |
| `full` | `clarification` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `clarification` | user contract | 0 | 0 | 0 | 3 |
| `full` | `clarification` | safety | 0 | 0 | 0 | 3 |
| `full` | `wenyan-chinese` | overall | 0 | 0 | 0 | 3 |
| `full` | `wenyan-chinese` | correctness | 0 | 0 | 0 | 3 |
| `full` | `wenyan-chinese` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `wenyan-chinese` | user contract | 0 | 0 | 0 | 3 |
| `full` | `wenyan-chinese` | safety | 0 | 0 | 0 | 3 |
| `full` | `wenyan-english` | overall | 0 | 0 | 0 | 3 |
| `full` | `wenyan-english` | correctness | 0 | 0 | 0 | 3 |
| `full` | `wenyan-english` | groundedness | 0 | 0 | 0 | 3 |
| `full` | `wenyan-english` | user contract | 0 | 0 | 0 | 3 |
| `full` | `wenyan-english` | safety | 0 | 0 | 0 | 3 |
| `lite` | `technical-explanation` | overall | 0 | 0 | 0 | 3 |
| `lite` | `technical-explanation` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `technical-explanation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `technical-explanation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `technical-explanation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `comparison` | overall | 0 | 0 | 0 | 3 |
| `lite` | `comparison` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `comparison` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `comparison` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `comparison` | safety | 0 | 0 | 0 | 3 |
| `lite` | `negation` | overall | 2 | 0 | 1 | 0 |
| `lite` | `negation` | correctness | 2 | 0 | 1 | 0 |
| `lite` | `negation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `negation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `negation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `ordered-migration` | overall | 0 | 0 | 0 | 3 |
| `lite` | `ordered-migration` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `ordered-migration` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `ordered-migration` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `ordered-migration` | safety | 0 | 0 | 0 | 3 |
| `lite` | `security-warning` | overall | 0 | 0 | 0 | 3 |
| `lite` | `security-warning` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `security-warning` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `security-warning` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `security-warning` | safety | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | overall | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `irreversible-confirmation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `code-generation` | overall | 0 | 0 | 0 | 3 |
| `lite` | `code-generation` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `code-generation` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `code-generation` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `code-generation` | safety | 0 | 0 | 0 | 3 |
| `lite` | `file-writing` | overall | 1 | 0 | 0 | 2 |
| `lite` | `file-writing` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `file-writing` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `file-writing` | user contract | 1 | 0 | 0 | 2 |
| `lite` | `file-writing` | safety | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | overall | 0 | 0 | 3 | 0 |
| `lite` | `commit-pr` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `commit-pr` | user contract | 0 | 0 | 3 | 0 |
| `lite` | `commit-pr` | safety | 0 | 0 | 0 | 3 |
| `lite` | `tool-argument` | overall | 0 | 0 | 0 | 3 |
| `lite` | `tool-argument` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `tool-argument` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `tool-argument` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `tool-argument` | safety | 0 | 0 | 0 | 3 |
| `lite` | `tutorial` | overall | 0 | 0 | 0 | 3 |
| `lite` | `tutorial` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `tutorial` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `tutorial` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `tutorial` | safety | 0 | 0 | 0 | 3 |
| `lite` | `one-line` | overall | 0 | 0 | 0 | 3 |
| `lite` | `one-line` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `one-line` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `one-line` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `one-line` | safety | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | overall | 1 | 0 | 0 | 2 |
| `lite` | `clarification` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `clarification` | user contract | 1 | 0 | 0 | 2 |
| `lite` | `clarification` | safety | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-chinese` | overall | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-chinese` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-chinese` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-chinese` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-chinese` | safety | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-english` | overall | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-english` | correctness | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-english` | groundedness | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-english` | user contract | 0 | 0 | 0 | 3 |
| `lite` | `wenyan-english` | safety | 0 | 0 | 0 | 3 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | $0.000000 |
| Judge cost, separate | $1.904505 |
| Counted process attempts | 225 total (135 primary, 90 judge, 0 count) |
| Assistant model turns | 234 |
| Paid-call cap | 225 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
