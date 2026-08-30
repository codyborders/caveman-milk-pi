# Targeted-v4 audit

Status: `FAILED`. Fresh-v1 remains blocked.

Targeted-v4 evaluated commit `d9f216f2af8d1df8d433ede8119cc0b5f4e18aa7`, prompt contract v6, and fixture SHA-256 `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee07`, and ten repetitions. All 120 primary processes and 80 blinded judge processes completed. Provider failures and judge failures were zero.

## Validator audit

The report exposed one more path parser defect. Choice text such as `yes/no` resembled an absolute path. Validator v7 requires at least two path segments, so choice labels no longer become target candidates. The corrected validator still rejects questions that omit the exact configured target.

Offline correction raises confirmation passes to 6/10 for `lite` and 8/10 for `full`. Both modes still fail genuine target-binding cases. Corrected all-category hard totals are 32/40 for `lite` and 29/40 for `full`. Active-only failures remain, so the gate fails.

V6 fixed exact-negation behavior. Both active modes passed all ten negation cases. It did not reliably stop unsupported notes in commit and PR drafts. `lite` passed 6/10 commit and PR cases. `full` passed 2/10. Full clarification passed 9/10 because one response mislabeled a clarification as approval.

## All-case primary metrics

Total primary tokens include input, cache read, cache write, and output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 256.1 | 206.4 | 0 | 513.1 | 975.6 | baseline | 10,129 ms | baseline |
| `lite` | 66.9 | 497.6 | 0 | 329.8 | 894.3 | -8.3% | 7,540 ms | -25.6% |
| `full` | 38.5 | 528.0 | 0 | 310.2 | 876.7 | -10.1% | 6,445 ms | -36.4% |

Incremental primary input plus cache-read overhead was 102 tokens for `lite` and 104 for `full`. V6 therefore missed the 100-token development target.

## Decision

V6 improves exact phrase retention but fails confirmation and grounded artifact gates. Contract v7 changes the confirmation sentence to an explicit question template. It also removes artifact notes and shortens the full mode rule. A new targeted run is required before any broader holdout.