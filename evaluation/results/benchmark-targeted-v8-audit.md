# Targeted-v8 audit

Status after offline validator correction: `BEHAVIOR PASS`. Fresh-v1 may proceed.

Targeted-v8 evaluated commit `ea587df280fd9b7e4f7ca791f8d0d794698d693c`, prompt contract v9, and targeted-v4 fixture SHA-256 `c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee0c`, and ten repetitions. All 120 primary processes and 80 blinded judge processes completed. Provider failures and judge failures were zero.

## Behavior

The paid validator reported one failure for each active mode. Both responses were valid artifacts with soft-wrapped prose. Validator v11 joins soft-wrapped prose before structure and groundedness checks.

Offline correction yields 40/40 hard passes for `lite` and 40/40 for `full`. Neither mode has an active-failed and off-passed pair. No wrong-target confirmation or unsupported claim passes. `off` fails three confirmation cases, while both active modes pass them.

Blinded quality has no active losses. `lite` has two wins plus 38 ties. `full` has one win plus 39 ties. Groundedness totals improve by four points for each active mode.

## All-case primary metrics

Total primary tokens include input, cache read, cache write, and output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 49.9 | 441.6 | 0 | 224.9 | 716.4 | baseline | 5,076 ms | baseline |
| `lite` | 65.5 | 528.0 | 0 | 126.7 | 720.2 | +0.5% | 3,184 ms | -37.3% |
| `full` | 47.5 | 544.0 | 0 | 145.6 | 737.1 | +2.9% | 3,246 ms | -36.0% |

Incremental primary input plus cache-read overhead is 102 tokens for `lite` and 100 for `full`. Output savings do not offset prompt overhead on these short tasks.

## Decision

Targeted-v8 passes its corrected behavioral gate. These short tasks do not establish a token-performance win. Fresh-v1 remains necessary. `full` stays the performance candidate because prior runs showed stronger latency and total-token behavior. `lite` remains under review.