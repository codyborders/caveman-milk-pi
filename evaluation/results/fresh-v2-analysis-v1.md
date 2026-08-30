# Fresh-v2 final analysis (v1)

Fresh-v2 compares `off` with `lite`. Prompt contract v9 is unchanged. The fixture SHA-256 is `8bd5776b40800d69e238100bfe5ccddf00e6d5ab826919c8c400835f9caf353a`.

The work started 612 primary processes and 300 judge processes. Provider failures and judge failures were both zero.

## Cache placement warning

The first run labeled cold did not create a cold condition. Only 1 of 75 pairs had zero cache reads in both arms. That run remains raw data and is excluded from release intervals.

The controlled cold run prepended equal-length unique identifiers before the normal system prompt. It produced 55 pairs with zero cache reads in both arms. The controlled warm run used one shared identifier after a warm-up and produced 65 pairs with positive cache reads in both arms. Mixed pairs remain in raw reports but are excluded from cache-specific intervals.

## Matched primary metrics

Deltas are `lite - off`. Intervals use 20,000 deterministic paired bootstrap samples. Only pairs where both arms pass corrected task validation are included.

| Condition | Cache-eligible pairs | Successful pairs |
| --- | ---: | ---: |
| cold | 55/75 | 53 |
| warm | 65/75 | 60 |

| Condition | Metric | Mean delta | Lower 95% | Upper 95% |
| --- | --- | ---: | ---: | ---: |
| cold | Total tokens | 19.2 | -9.1 | 46.5 |
| cold | End-to-end ms | -974.4 | -1379.2 | -581.9 |
| cold | First-token ms | -18.6 | -38.6 | -2.8 |
| cold | Single-turn generation ms | -955.8 | -1355.0 | -559.6 |
| warm | Total tokens | -20.8 | -217.1 | 121.5 |
| warm | End-to-end ms | 83.1 | -672.0 | 842.6 |
| warm | First-token ms | -15.0 | -43.5 | 5.1 |
| warm | Single-turn generation ms | -545.7 | -1117.8 | 5.6 |

| Condition | Mode | Input | Cache read | Cache write | Output | Total | Tool ms | Tool calls | Retries | Rereads | Corrective turns |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cold | off | 507.5 | 0.0 | 0.0 | 226.9 | 734.4 | 0.0 | 0.00 | n/a | 0.00 | 0.00 |
| cold | lite | 609.4 | 0.0 | 0.0 | 144.2 | 753.6 | 0.0 | 0.00 | n/a | 0.00 | 0.00 |
| warm | off | 257.3 | 1722.7 | 0.0 | 314.6 | 2294.6 | 27.1 | 1.05 | n/a | 0.00 | 0.22 |
| warm | lite | 208.4 | 1828.3 | 0.0 | 237.1 | 2273.8 | 29.4 | 1.07 | n/a | 0.00 | 0.22 |

## Task success

| Condition | Off | Lite | Lite-only successes | Off-only successes |
| --- | ---: | ---: | ---: | ---: |
| cold | 72/75 | 74/75 | 3 | 1 |
| warm | 70/75 | 75/75 | 5 | 0 |

One lite-only failure remains after validator correction. Its response omits the required production-database context from a safety warning. The full response and raw pointer are in the JSON report.

## Information preservation

| Mode | Critical omissions | Noncritical omissions | Altered facts | Unsupported claims | Ordering errors | Warning failures | Negation failures | Changed commands | Changed paths |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| off | 2 | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 0 |
| lite | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

Blinded quality for controlled runs is 24 wins, 122 ties, and 4 losses for lite. Two losses concern unsupported certainty in safety warnings. Two concern unspecified parser edge cases.

## Whole coding tasks

The controlled reports include 40 coding sessions. They measure complete assistant and workspace-tool activity through the final response. Parent handoff tool messages are retained in raw results. No child model was spawned. The deterministic handoff tool records the subagent message boundary.

Pi does not report internal provider retries, so retry values remain unknown. The runner records workspace rereads and corrective turns. It does not identify clarification turns separately.

| Mode | Sessions | Passed | Tool calls | Rereads | Corrective turns |
| --- | ---: | ---: | ---: | ---: | ---: |
| off | 20 | 18 | 123 | 0 | 30 |
| lite | 20 | 20 | 123 | 0 | 30 |

## Four-axis decision

| Axis | Result | Reason |
| --- | --- | --- |
| totalTokenReduction | FAIL | At least one cache-controlled paired interval reaches zero. |
| latency | FAIL | At least one cache-controlled paired latency interval reaches zero. |
| taskSuccess | PASS | The zero-margin paired success interval is nonnegative. The one lite-only failure is recorded. |
| informationPreservation | FAIL | Lite has a critical safety omission or a task-impact judge loss. |

Final decision: keep `off` as default. Stop prompt tuning. Lite fails information preservation and does not satisfy every release gate.
