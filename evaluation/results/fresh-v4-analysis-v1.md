# Fresh-v4 selective-final v11 analysis

Fresh-v4 compares `off` with `selective-final-v11`. Every base parent and child runs with Caveman off. Only the tools-disabled finalizer receives v11.

Deltas are `selective-final-v11 - off`. Total tokens include input, cache read, cache write, and output tokens for each parent, child, and finalizer once.

Intervals use 20,000 deterministic paired bootstrap samples. Primary token and latency metrics use cache-eligible pairs where both arms pass behavior and topology checks.

Controlled cold and warm runs used 380 primary processes and 80 judge processes. Provider failures: 0. Judge failures: 0.

## Controlled conditions

| Condition | Eligible pairs | Successful pairs | Token delta | Token lower 95% | Token upper 95% | Latency delta ms | Latency lower 95% | Latency upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold | 33 | 24 | 333.7 | 105.6 | 584.7 | 2676.7 | -111.5 | 5417.8 |
| Warm | 6 | 5 | 134.0 | 75.8 | 192.2 | 89.4 | -2148.2 | 1840.4 |

Mixed and ineligible pairs remain in raw reports with pointers and exclusion reasons.

## Declared deployment mix

The deployment mix weights cold and warm conditions equally.

| Metric | Pairs | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: |
| Complete-tree tokens | 29 | 233.9 | 118.0 | 363.8 |
| End-to-end latency ms | 29 | 1383.0 | -359.5 | 3061.3 |

## Task success

| Group | Pairs | Off passed | Candidate passed | Candidate rate | Mean delta | Lower 95% | Upper 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct | 50 | 42 | 39 | 0.780 | -0.060 | -0.140 | 0.000 |
| Nested | 30 | 24 | 22 | 0.733 | -0.067 | -0.200 | 0.067 |

Nested non-inferiority requires a lower bound of at least zero. The candidate must also pass every nested task.

## Information preservation

| Finding group | Count |
| --- | ---: |
| Critical final-response findings | 2 |
| Task-impacting handoff losses | 8 |
| Task-impacting blinded-judge losses | 18 |

Full final responses, base responses, child requests, child responses, judge notes, raw pointers, and hashes remain in raw reports.

## Injection topology

- Off finalizer injections: 0
- Candidate finalizer injections: 80
- Candidate injections outside finalizers: 0
- Candidate finalizer characters: 822

## Release gates

| Gate | Result |
| --- | --- |
| Total-token reduction | FAIL |
| End-to-end latency | FAIL |
| Nested task success | FAIL |
| Information preservation | FAIL |

Final decision: keep mode off.
