# Fresh-v3 analysis (v1)

Fresh-v3 compares `off` with `lite` under prompt contract v10. It records real parent-child trees. The fixture SHA-256 is `df12469c154635f1c00cebb6490e6fcacbd78dfcae584eb5c10b27ddf13c37d3`.

## Candidate overhead

Provider usage reports 77 injected lite tokens across 25 matched warm pairs. Every pair reports the same value. The approximate v9 baseline is 102 tokens. V10 removes 25 tokens, or 24.5 percent.

## Process accounting

Controlled runs used 220 primary processes and 80 judge processes. Preflight and warm-up used 24 more primary processes. The complete experiment used 324 model processes. No process from analysis generation is included.

## Verified cache conditions

Cold eligibility requires zero cache reads for each parent and child node in both modes. Warm eligibility requires positive reads for every node. Other pairs remain in raw reports.

| Condition | Verified pairs | Successful pairs | Mixed pairs |
| --- | ---: | ---: | ---: |
| cold | 25/40 | 20 | 0 |
| warm | 33/40 | 27 | 6 |

## Matched task metrics

Deltas are `lite - off`. Successful-pair intervals include pairs where both modes pass corrected validation. Total tree tokens sum every parent and child process once.

Generation duration is observable for single-turn direct tasks only. Root end-to-end latency is the complete critical path through the final answer.

| Condition | Metric | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | --- | ---: | ---: | ---: | ---: |
| cold | Total tree tokens | 20 | 101.0 | 56.7 | 149.3 |
| cold | Root end-to-end ms | 20 | 381.6 | -464.1 | 1254.3 |
| cold | First-token ms | 20 | 24.9 | -26.8 | 97.2 |
| cold | Generation ms (single-turn direct) | 20 | 356.8 | -481.8 | 1209.7 |
| warm | Total tree tokens | 27 | 255.6 | -197.7 | 824.3 |
| warm | Root end-to-end ms | 27 | 634.8 | -1949.5 | 2888.9 |
| warm | First-token ms | 27 | -6.2 | -30.6 | 22.2 |
| warm | Generation ms (single-turn direct) | 16 | 3309.9 | 1991.2 | 4672.8 |

The declared deployment mix is 50 percent cold and 50 percent warm. Its total-token delta is 178.3 with interval [-51.5, 462.5]. Its root-latency delta is 508.2 ms with interval [-796.5, 1708.1].

## Complete-tree operations

| Mode | Tool calls | Rereads | Unknown reread nodes | Corrective turns | Clarification turns | Passing final test nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| off | 212 | 20 | 50 | 2 | 4 | 60/60 |
| lite | 215 | 20 | 51 | 3 | 5 | 60/60 |

## Task success

| Task group | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: |
| all | 80 | 0.050 | -0.050 | 0.150 |
| singleAgent | 50 | 0.140 | 0.060 | 0.240 |
| nestedAgent | 30 | -0.100 | -0.300 | 0.100 |

Lite has 6 case failures where off passes.

| Condition | Repetition | Category | Finding | Off raw pointer | Lite raw pointer |
| --- | ---: | --- | --- | --- | --- |
| cold | 1 | v3-nested-rollout-review | ordering-error:next-steps | `/results/15` | `/results/14` |
| cold | 2 | v3-nested-fix | missing-number:result | `/results/27` | `/results/26` |
| cold | 2 | v3-nested-rollout-review | ordering-error:next-steps | `/results/31` | `/results/30` |
| cold | 5 | v3-nested-rollout-review | ordering-error:next-steps | `/results/79` | `/results/78` |
| warm | 2 | v3-nested-fix | missing-number:result | `/results/27` | `/results/26` |
| warm | 4 | v3-nested-rollout-review | ordering-error:next-steps | `/results/63` | `/results/62` |

## Information preservation

User-facing checks found 11 critical omissions and 1 missing negations for lite. They also found 5 ordering errors and 1 changed paths. Warning failures total 0.

Inter-agent structural checks found 0 missing delegations and 0 incomplete trees. The JSON report stores 60 full handoff records. Each record separates the parent request, child response, parent response, validation findings, and any blinded loss. Blinded review marks 5 handoffs as task-impacting losses.

Blinded judgment records 27 wins, 43 ties, and 10 losses for lite. Complete loss records are stored in the JSON report.

## Four conjunctive gates

| Gate | Result | Reason |
| --- | --- | --- |
| totalTreeTokenReduction | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix interval is not below zero. |
| latency | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix latency interval is not below zero. |
| taskSuccess | FAIL | The paired success interval crosses below zero or records 6 lite-only failure(s). |
| preservation | FAIL | Lite has a user-facing critical finding or 5 task-impacting handoff loss(es). |

Final decision: keep default mode `off`. Do not recommend or release lite-v10.
