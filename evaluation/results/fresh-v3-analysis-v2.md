# Fresh-v3 analysis (v2)

Fresh-v3 compares `off` with `lite` under prompt contract v10. It records real parent-child trees. The fixture SHA-256 is `df12469c154635f1c00cebb6490e6fcacbd78dfcae584eb5c10b27ddf13c37d3`.

## Candidate overhead

Provider usage reports exactly 77 v10 injected lite tokens across 25 matched warm pairs. Every pair reports the same value. Prior PR text used 102 as a cross-run comparison. No record verifies it as a matched v9 measure. The v9 deterministic estimate is 113. README attributes the 102-token measurement to v6. Cross-run reduction against the v9 estimate is approximate at 31.9 percent.

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

User-facing checks found 11 totalCriticalFindings for lite. Counts by validator finding type follow. Required-fact omissions: 4. Missing negations: 1. Missing warnings: 0. Changed or missing paths: 1. Changed or missing commands: 0. Ordering errors: 5. Unsupported claims: 0. Each listed category is a subset of totalCriticalFindings. Categories are mutually exclusive by validator finding type. Do not add category counts to totalCriticalFindings.

Inter-agent structural checks found 0 missing delegations and 0 incomplete trees. The JSON report stores 60 full handoff records. Each record separates the parent request, child response, parent response, validation findings, and any blinded loss. Blinded review marks 5 handoffs as task-impacting losses.

Blinded judgment records 27 wins, 43 ties, and 10 losses for lite. Complete loss records are stored in the JSON report.

## Four conjunctive gates

| Gate | Result | Reason |
| --- | --- | --- |
| totalTreeTokenReduction | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix interval is not below zero. |
| latency | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix latency interval is not below zero. |
| taskSuccess | FAIL | The paired success interval crosses below zero or records 6 lite-only failure(s). |
| preservation | FAIL | Lite has a user-facing critical finding or 5 task-impacting handoff loss(es). |

## Validator reconciliation

Previous validator: `schema5-task-success-v13` at commit `4d40fd64b47ca4806b838412c20415033c395e39`. Current validator: `schema5-task-success-v14` at commit `449c4968f1314e67220e2b60d037a2b7e08ba603`. v14 recognizes explicit unfinished, incomplete, pending, unknown, unverified, has-not-run/completed, and not-yet-run/completed gap statements.

Reclassified results: 11. Pair-level inclusion changes: 2. Raw source paths, pointers, response hashes, old and new pass states, and exclusion reasons are retained in JSON.

| Metric | V13 count | V13 mean | V13 lower 95% | V13 upper 95% | V14 count | V14 mean | V14 lower 95% | V14 upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm total tree tokens | 25 | 210.2 | -277.9 | 825.4 | 27 | 255.6 | -197.7 | 824.3 |
| Warm root latency ms | 25 | 652.0 | -2092.2 | 2976.7 | 27 | 634.8 | -1949.5 | 2888.9 |
| Warm first-token ms | 25 | -18.4 | -38.0 | 3.8 | 27 | -6.2 | -30.6 | 22.2 |
| Deployment-mix total tree tokens | 45 | 155.6 | -87.7 | 463.9 | 47 | 178.3 | -51.5 | 462.5 |
| Deployment-mix root latency ms | 45 | 516.8 | -890.5 | 1748.9 | 47 | 508.2 | -796.5 | 1708.1 |

The only pair-level inclusion changes are warm nested rollout-review repetitions 2 and 3. Their token deltas are +672 and +974. Their root-latency deltas are +6051 ms and -5210 ms. Their first-token deltas are +75 ms and +219 ms. Adding these two pairs changes the warm and deployment-mix means and intervals. Cold metrics remain unchanged.

## Task-group performance

Task-group metrics show input, cacheRead, cacheWrite, output, totalTokens, and criticalPathLatencyMs with off mean, lite mean, paired mean delta, and paired interval.

### direct single-agent tasks — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 521.8 | 598.2 | 76.4 | 75.7 | 77.1 | 20 | available |
| cacheRead | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 20 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 20 | available |
| output | 258.4 | 283.0 | 24.6 | -19.9 | 72.8 | 20 | available |
| totalTokens | 780.3 | 881.2 | 101.0 | 56.6 | 149.3 | 20 | available |
| criticalPathLatencyMs | 5196.4 | 5578.1 | 381.6 | -461.4 | 1253.2 | 20 | available |

### direct single-agent tasks — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 38.7 | 15.7 | -23.0 | -39.0 | -7.0 | 16 | available |
| cacheRead | 476.0 | 576.0 | 100.0 | 84.0 | 116.0 | 16 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 16 | available |
| output | 370.8 | 335.3 | -35.6 | -115.9 | 40.8 | 16 | available |
| totalTokens | 885.5 | 926.9 | 41.4 | -40.4 | 118.8 | 16 | available |
| criticalPathLatencyMs | 7232.7 | 10529.7 | 3297.0 | 1953.4 | 4697.3 | 16 | available |

### direct single-agent tasks — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 280.2 | 306.9 | 26.7 | 18.8 | 34.7 | 36 | available |
| cacheRead | 238.0 | 288.0 | 50.0 | 42.0 | 58.0 | 36 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 36 | available |
| output | 314.6 | 309.1 | -5.5 | -51.8 | 39.6 | 36 | available |
| totalTokens | 832.9 | 904.1 | 71.2 | 24.1 | 117.2 | 36 | available |
| criticalPathLatencyMs | 6214.6 | 8053.9 | 1839.3 | 1049.9 | 2645.3 | 36 | available |

### nested parent nodes — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### nested parent nodes — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 1361.4 | 1067.6 | -293.7 | -713.1 | 136.0 | 11 | available |
| cacheRead | 4631.3 | 5550.5 | 919.3 | 186.2 | 1722.2 | 11 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11 | available |
| output | 889.7 | 726.7 | -163.0 | -290.5 | -24.1 | 11 | available |
| totalTokens | 6882.4 | 7344.9 | 462.5 | -162.5 | 1152.2 | 11 | available |
| criticalPathLatencyMs | 24672.5 | 19118.4 | -5554.2 | -9494.4 | -1454.1 | 11 | available |

### nested parent nodes — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### nested child nodes — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### nested child nodes — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 906.8 | 672.3 | -234.5 | -624.7 | 105.0 | 11 | available |
| cacheRead | 3269.8 | 3816.7 | 546.9 | -151.3 | 1640.7 | 11 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11 | available |
| output | 602.9 | 395.1 | -207.8 | -443.5 | 0.0 | 11 | available |
| totalTokens | 4779.5 | 4884.1 | 104.5 | -875.8 | 1432.0 | 11 | available |
| criticalPathLatencyMs | 18179.5 | 20496.3 | 2316.7 | -1884.5 | 6409.9 | 11 | available |

### nested child nodes — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### complete nested trees — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### complete nested trees — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 2268.2 | 1739.9 | -528.3 | -1128.4 | 141.5 | 11 | available |
| cacheRead | 7901.1 | 9367.3 | 1466.2 | 256.0 | 2903.3 | 11 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11 | available |
| output | 1492.6 | 1121.8 | -370.8 | -672.8 | -92.0 | 11 | available |
| totalTokens | 11661.9 | 12229.0 | 567.1 | -552.0 | 1911.7 | 11 | available |
| criticalPathLatencyMs | 42852.1 | 39614.6 | -3237.5 | -8233.5 | 1272.5 | 11 | available |

### complete nested trees — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### final user-facing responses — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 521.8 | 598.2 | 76.4 | 75.8 | 77.1 | 20 | available |
| cacheRead | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 20 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 20 | available |
| output | 258.4 | 283.0 | 24.6 | -19.6 | 72.3 | 20 | available |
| totalTokens | 780.3 | 881.2 | 101.0 | 57.1 | 149.2 | 20 | available |
| criticalPathLatencyMs | 4792.9 | 5149.7 | 356.8 | -475.6 | 1212.0 | 20 | available |

### final user-facing responses — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 186.2 | 87.9 | -98.3 | -194.5 | -16.8 | 27 | available |
| cacheRead | 922.1 | 1050.1 | 128.0 | 42.7 | 225.2 | 27 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 27 | available |
| output | 342.3 | 305.3 | -36.9 | -89.9 | 14.4 | 27 | available |
| totalTokens | 1450.5 | 1443.3 | -7.2 | -97.3 | 78.7 | 27 | available |
| criticalPathLatencyMs | 6791.4 | 10101.3 | 3309.9 | 1985.5 | 4667.8 | 16 | available |

### final user-facing responses — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 354.0 | 343.1 | -10.9 | -60.3 | 29.3 | 47 | available |
| cacheRead | 461.0 | 525.0 | 64.0 | 21.3 | 112.6 | 47 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 47 | available |
| output | 300.4 | 294.2 | -6.2 | -41.0 | 29.7 | 47 | available |
| totalTokens | 1115.4 | 1162.3 | 46.9 | -3.3 | 95.6 | 47 | available |
| criticalPathLatencyMs | 5792.2 | 7625.5 | 1833.3 | 1038.7 | 2634.2 | 36 | available |

### parent-to-child requests — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### parent-to-child requests — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 227.7 | 238.0 | 10.3 | -139.6 | 221.5 | 11 | available |
| cacheRead | 1024.0 | 1035.6 | 11.6 | -215.3 | 151.3 | 11 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11 | available |
| output | 342.5 | 310.5 | -31.9 | -106.7 | 28.6 | 11 | available |
| totalTokens | 1594.2 | 1584.2 | -10.0 | -88.1 | 69.5 | 11 | available |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### parent-to-child requests — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### child-to-parent responses — cold

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### child-to-parent responses — warm

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | 143.0 | 81.8 | -61.2 | -137.7 | -0.4 | 11 | available |
| cacheRead | 1210.2 | 1175.3 | -34.9 | -290.9 | 215.3 | 11 | available |
| cacheWrite | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11 | available |
| output | 223.7 | 206.1 | -17.6 | -77.5 | 38.6 | 11 | available |
| totalTokens | 1576.9 | 1463.2 | -113.7 | -348.2 | 97.1 | 11 | available |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

### child-to-parent responses — deployment mix

| Metric | Off mean | Lite mean | Paired mean delta | Lower 95% | Upper 95% | Pairs | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| input | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheRead | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| cacheWrite | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| output | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| totalTokens | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |
| criticalPathLatencyMs | n/a | n/a | n/a | n/a | n/a | 0 | unavailable |

## Prompt comparability and attribution

Provider, cache, prompt-position, and task-identity comparability booleans are false. Identical comparability is not established. The warm complete nested tree regression comes mainly from increased cache reads while input and output decline. The deployment-mix direct regression also has higher input and cache reads while output is nearly unchanged. Parent request and child response payload turns shrink, so larger handoffs do not explain regression. One extra corrective turn and one extra clarification turn exist globally, but raw data cannot isolate their token effect. Repeated parent-child prompt injection is present, but its exact share cannot be separated from cache behavior. Attribution cannot be isolated from these raw reports.

Final decision: keep default mode `off`. Do not recommend or release lite-v10.
