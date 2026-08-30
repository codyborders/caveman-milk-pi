# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-d37242b07e700ebd` |
| Schema | 4 |
| Report passed | no |
| Fixture set | `benchmark-regression-v2` |
| Fixture hash | `da6ff6b621fa512301c954cc94850ca7a1ff3873766302c97ad69ec1cd4d0adb` |
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
| `off` | 45 | 39 | 44 | 45 | 40 | 45 | n/a | n/a | n/a | n/a | 0 |
| `lite` | 45 | 37 | 42 | 45 | 40 | 45 | 0.8417 | 0.8333 | 0.9432 | 0.7138 | 21 |
| `full` | 45 | 40 | 45 | 45 | 42 | 43 | 0.9056 | 0.7500 | 0.9618 | 0.6542 | 23 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | $0.000000 |
| Judge cost, separate | $1.904505 |
| Counted process attempts | 225 total (135 primary, 90 judge, 0 count) |
| Assistant model turns | 234 |
| Paid-call cap | 225 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
