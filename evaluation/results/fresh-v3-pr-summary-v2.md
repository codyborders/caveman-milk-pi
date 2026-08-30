# Fresh-v3 PR summary (v2)

V10 reduces prompt injection itself. V10 does not reduce complete-task tokens. V10 does not improve complete-task latency. Single-agent success improves. Nested-agent success declines. Required information is lost in final responses and real agent handoffs.

## Metrics

| Condition | Verified pairs | Successful pairs |
| --- | ---: | ---: |
| cold | 25/40 | 20 |
| warm | 33/40 | 27 |

| Task group | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: |
| all | 80 | 0.050 | -0.050 | 0.150 |
| singleAgent | 50 | 0.140 | 0.060 | 0.240 |
| nestedAgent | 30 | -0.100 | -0.300 | 0.100 |

Deployment mix is declared 50/50 cold and warm. Total-token delta: 178.3. Root-latency delta: 508.2.

## Task-group performance

| Group | Condition | Token pairs | Token delta | Token lower 95% | Token upper 95% | Latency pairs | Latency delta | Latency lower 95% | Latency upper 95% |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| direct single-agent tasks | cold | 20 | 101.0 | 56.6 | 149.3 | 20 | 381.6 | -461.4 | 1253.2 |
| direct single-agent tasks | warm | 16 | 41.4 | -40.4 | 118.8 | 16 | 3297.0 | 1953.4 | 4697.3 |
| direct single-agent tasks | deployment mix | 36 | 71.2 | 24.1 | 117.2 | 36 | 1839.3 | 1049.9 | 2645.3 |
| nested parent nodes | warm | 11 | 462.5 | -162.5 | 1152.2 | 11 | -5554.2 | -9494.4 | -1454.1 |
| nested child nodes | warm | 11 | 104.5 | -875.8 | 1432.0 | 11 | 2316.7 | -1884.5 | 6409.9 |
| complete nested trees | warm | 11 | 567.1 | -552.0 | 1911.7 | 11 | -3237.5 | -8233.5 | 1272.5 |
| final user-facing responses | cold | 20 | 101.0 | 57.1 | 149.2 | 20 | 356.8 | -475.6 | 1212.0 |
| final user-facing responses | warm | 27 | -7.2 | -97.3 | 78.7 | 16 | 3309.9 | 1985.5 | 4667.8 |
| final user-facing responses | deployment mix | 47 | 46.9 | -3.3 | 95.6 | 36 | 1833.3 | 1038.7 | 2634.2 |
| parent-to-child requests | warm | 11 | -10.0 | -88.1 | 69.5 | 0 | n/a | n/a | n/a |
| child-to-parent responses | warm | 11 | -113.7 | -348.2 | 97.1 | 0 | n/a | n/a | n/a |

## Preservation

Lite totalCriticalFindings: 11. Each listed category is a subset of totalCriticalFindings. Categories are mutually exclusive by validator finding type, but they are not additive to totalCriticalFindings.

## Gates

| totalTreeTokenReduction | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix interval is not below zero. |
| latency | FAIL | The paired 50 percent cold and 50 percent warm deployment-mix latency interval is not below zero. |
| taskSuccess | FAIL | The paired success interval crosses below zero or records 6 lite-only failure(s). |
| preservation | FAIL | Lite has a user-facing critical finding or 5 task-impacting handoff loss(es). |
