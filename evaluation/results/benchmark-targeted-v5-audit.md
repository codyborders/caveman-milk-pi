# Targeted-v5 audit

Status: `FAILED`. Fresh-v1 remains blocked.

Targeted-v5 evaluated commit `4191446d28c6e11d202badff49dfb665b665f0b4`, prompt contract v7, and fixture SHA-256 `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee08`, and ten repetitions. All 120 primary processes and 80 blinded judge processes completed. Provider failures and judge failures were zero.

## Behavior

V7 fixed target binding. Both active modes passed all ten confirmation cases. `full` passed all negation cases and had zero active-failed and off-passed pairs across the entire run. It still passed only 7/10 commit and PR cases after offline validator correction. One clarification case also changed the required phrase.

`lite` passed 7/10 negation cases. It should not be recommended as the performance mode.

The remaining commit and PR failures add testing sections, implementation commentary, or claims beyond the three supplied facts. Some terse missing-information headings exposed another deterministic false reject. Validator v8 accepts headings and concise statements such as `None supplied.` It still rejects positive test or implementation claims.

## All-case primary metrics

Total primary tokens include input, cache read, cache write, and output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 281.7 | 180.8 | 0 | 511.9 | 974.4 | baseline | 9,950 ms | baseline |
| `lite` | 51.5 | 512.0 | 0 | 274.5 | 838.0 | -14.0% | 8,999 ms | -9.6% |
| `full` | 34.5 | 528.0 | 0 | 269.5 | 832.0 | -14.6% | 5,542 ms | -44.3% |

Incremental primary input plus cache-read overhead was 101 tokens for `lite` and 100 for `full`.

## Decision

V7 makes `full` the clear candidate but misses the all-active-pass gate. Contract v8 keeps the same 444-character full prompt. It requires requested artifact fields only, forbids extra text, and strengthens exact required wording. Another targeted run must pass before fresh-v1.