# Targeted-v7 audit

Status: `FAILED`. Fresh-v1 remains blocked.

Targeted-v7 evaluated commit `b6a191d4f4b3694e35e3f89ee288a2ebf08d19bc`, prompt contract v9 draft one, and targeted-v3 fixture SHA-256 `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee0a`, and ten repetitions. All 120 primary processes and 80 blinded judge processes completed. Provider failures and judge failures were zero.

## Behavior

`full` passed all negation and confirmation cases. It passed 6/10 commit and PR cases plus 8/10 clarification cases. `lite` passed 6/10 negation cases. Both modes therefore fail the all-active-pass gate.

The task prompts still encouraged avoidable file inspection and free-form artifact sections. Targeted-v4 fixtures remove that ambiguity. They explicitly prohibit file reads for the missing-policy task. They also require exactly two artifact fields and forbid extra sections.

## All-case primary metrics

Total primary tokens include input, cache read, cache write, and output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 260.9 | 201.6 | 0 | 548.4 | 1,010.9 | baseline | 9,923 ms | baseline |
| `lite` | 43.9 | 521.6 | 0 | 294.2 | 859.7 | -15.0% | 5,900 ms | -40.5% |
| `full` | 57.9 | 505.6 | 0 | 296.2 | 859.7 | -15.0% | 5,606 ms | -43.5% |

Incremental primary input plus cache-read overhead was 103 tokens for `lite` and 101 for `full`.

## Decision

The original targeted-v3 fixture has enough ambiguity to obscure prompt changes. Targeted-v4 fixture SHA-256 `c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de` fixes the task wording before any run uses it. Contract v9 draft two keeps `full` at 437 characters and scopes confirmation behavior. A three-repetition development run must pass before another ten-repetition gate.