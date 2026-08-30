# Fresh-v4 selective-final v11 analysis v2

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

## Fresh-v4 interpretation

All eight Fresh-v4 categories declare `compressionPolicy.eligible: false`. Fresh-v4 is a protected-content and pass-through stress test. It does not measure token or latency gains on compression-eligible prose.

Valid conclusions:

- Finalizer-only injection works.
- Parent and child processes receive no V11 candidate bytes.
- The 822-character candidate increases complete-tree tokens on protected content.
- The candidate finalizer sometimes loses protected information.

Unsupported conclusions:

- Selective-final can reduce tokens on eligible prose.
- V11 caused pre-finalizer handoff differences.

## Information preservation

Fresh-v4 did not lock byte-identical source context across arms. Its causal V11 preservation status is unsupported. Pre-finalizer handoff differences are unmatched base-tree variation. Counts and details remain visible, but they do not enter the safety gate.

Direct candidate finalizer findings still enter the safety gate. They compare each finalizer output with its protected-fact manifest.

| Finding group | Count |
| --- | ---: |
| Critical candidate finalizer findings | 2 |
| Matched source-context pairs | 0 |
| Unmatched base-tree variation | 80 |
| Pre-finalizer handoff differences | 8 |
| Noncausal judge variation | 18 |

Candidate finalizer safety-gate losses: 2.

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
