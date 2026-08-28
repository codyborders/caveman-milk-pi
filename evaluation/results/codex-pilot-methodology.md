# Evaluation Report Summary

## Run identity

| Field | Value |
| --- | --- |
| Run | `caveman-eval-a98df3f2e37e2dfd` |
| Schema | 3 |
| Provider | `pi` via `pi` |
| Primary model | `z-ai/glm-5.3` |
| Seed | `0xc0ffee02` |
| Evaluator commit | `c09c17b4dbfe831e2136ede255b778adb8d100dc` |
| Pi version | `0.84.3` |
| Runtime prompt hash | `03edd1eb4baa46467645a0a0607f0066951043a444763b43138843f681f108f8` |
| Prompt contract hash | `c59769742e305985e772eb5fa4b34931cd644ed09e908cfe7abccbff9c2ab8e6` |
| Repetitions | 3 |
| Categories | 15 |
| Judge | enabled with `openai-codex/gpt-5.6-sol` |

## Per-mode results

| Mode | Cases | Passed | Validator | Brevity | Judge quality | Input tok | Cache write | Cache read | Output tok | Primary cost | Paired output mean | Paired output median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 45 | 40 | 40 | 45 | n/a | 18,655 | 0 | 3,840 | 15,631 | $0.000000 | n/a | n/a |
| `lite` | 45 | 24 | 39 | 34 | 36 | 5,341 | 0 | 22,784 | 12,058 | $0.000000 | 1.0955 | 0.6606 |
| `full` | 45 | 19 | 37 | 31 | 32 | 3,700 | 0 | 24,576 | 10,065 | $0.000000 | 0.7381 | 0.6556 |

## Totals

| Field | Value |
| --- | ---: |
| Primary cost | $0.000000 |
| Judge cost, separate | $1.428220 |
| Counted process attempts | 225 total (135 primary, 90 judge, 0 count) |
| Assistant model turns | 234 |
| Paid-call cap | 225 |

Process attempts cap spawned provider processes: one primary, judge, or count process each reserves one attempt. Tool-loop turns are assistant responses inside one process, so assistant model turns can exceed counted process attempts.
