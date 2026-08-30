# Fresh-v1 prompt v9 audit

Status: `FAILED`. Mode `off` remains default.

Fresh-v1 evaluated commit `caf16afce666c5fea3f2ad5d3190c4b70ae16b9f`, prompt contract SHA-256 `3611fa174ef844d6323a1e1f28428c78d00316588607d6f0b68df62e58734d49`, and fixture SHA-256 `d961c987a01da8fe2280037489cca42e6c1f303fc06e9d570495dffde3818e3e`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee0d`, and five repetitions. All 180 primary processes and 120 blinded judge processes completed. Provider failures and judge failures were zero.

## Task success

| Mode | Hard passes | Success rate | Active failed, off passed | Active passed, off failed |
| --- | ---: | ---: | ---: | ---: |
| `off` | 49/60 | 81.7% | baseline | baseline |
| `lite` | 42/60 | 70.0% | 9 | 2 |
| `full` | 40/60 | 66.7% | 10 | 1 |

Active failures cluster in safety warnings, document artifacts, file output, commit messages, and PR descriptions. Several tasks request substantive artifacts without supplying project or change facts. Active modes mark those gaps, while some `off` responses invent tests or implementation details. The frozen hard validators often reject the grounded gap response and accept unsupported prose. Fresh-v1 therefore cannot establish grounded task success under its current contract.

## Primary metrics

Total primary tokens equal input plus cache read plus cache write plus output. Judge usage and judge latency are excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 397.4 | 52.3 | 0 | 395.7 | 845.4 | baseline | 8,410 ms | baseline |
| `lite` | 39.7 | 512.0 | 0 | 239.1 | 790.8 | -6.5% | 4,979 ms | -40.8% |
| `full` | 37.7 | 512.0 | 0 | 239.0 | 788.6 | -6.7% | 5,356 ms | -36.3% |

The paired all-case token interval crosses zero for both modes. `lite` mean delta is -54.6 tokens with a 95% interval from -122.6 to 13.4. `full` mean delta is -56.8 with an interval from -127.0 to 13.4. Median deltas are positive at 12 and 28 tokens. Prompt input-plus-cache-read overhead is 102 tokens for `lite` and 100 for `full`.

Latency intervals exclude zero. `lite` mean delta is -3,431 ms with a 95% interval from -5,133 to -1,730. `full` mean delta is -3,054 ms with an interval from -4,865 to -1,243.

## Blinded quality

`lite` records 18 wins, 34 ties, and 8 losses. `full` records 18 wins, 34 ties, and 8 losses. Aggregate quality improves, but both modes have material losses and lower deterministic task success.

## Decision

The holdout fails task success, active-only behavior, quality consistency, and token-confidence gates. Repetitions were not extended because the hard task-success gate already failed and additional samples cannot repair those responses. Multi-turn final performance runs were not started because the single-turn holdout disqualified the candidate. No default-mode change is allowed.