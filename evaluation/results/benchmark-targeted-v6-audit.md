# Targeted-v6 audit

Status: `FAILED`. Fresh-v1 remains blocked.

Targeted-v6 evaluated commit `efb1ed85ae087f53f42130b7286c87bec280d92c`, prompt contract v8, and fixture SHA-256 `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee09`, and ten repetitions. All 120 primary processes and 80 blinded judge processes completed. Provider failures and judge failures were zero.

## Behavior

Both active modes passed all ten confirmation and clarification cases. `full` passed 9/10 negation cases and had one active-only failure. It passed 8/10 commit and PR cases under the paid validator. Offline validator correction accepts a plain opening title, raising `full` commit and PR success to 9/10.

The remaining full negation failure ignored the required exact sentence and tried to inspect the directory. The remaining full artifact failure added notes plus an unrelated approval question. V8 therefore misses the all-active-pass gate.

`lite` passed 9/10 negation cases and 7/10 commit and PR cases. It remains weaker than `full`.

## All-case primary metrics

Total primary tokens include input, cache read, cache write, and output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 259.3 | 203.2 | 0 | 453.3 | 915.8 | baseline | 8,712 ms | baseline |
| `lite` | 59.9 | 505.6 | 0 | 252.2 | 817.7 | -10.7% | 5,306 ms | -39.1% |
| `full` | 52.5 | 512.0 | 0 | 270.5 | 835.0 | -8.8% | 6,603 ms | -24.2% |

Incremental primary input plus cache-read overhead was 103 tokens for `lite` and 102 for `full`. V8 misses the 100-token development target.

## Decision

V8 nearly passes `full` behavior but remains invalid for broader evaluation. Contract v9 scopes the confirmation template to confirmation requests. It also strengthens exact required wording and shortens the full mode rule. Another targeted run is required before fresh-v1.