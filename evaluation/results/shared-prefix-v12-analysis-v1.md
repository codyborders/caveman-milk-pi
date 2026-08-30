# Shared-prefix v12 final analysis

Source report: `shared-prefix-v12-final-v1.json`

Final v1 contains 35 valid warm pairs and 0 exclusions.
The default mode remains `off`. Every failed gate keeps mode off.

## Preflights

- v1 preflight was invalid due a relative Pi launcher.
- v2 was invalid because finalizers retained tools.
- v3 was valid preflight only.

## Eligible group

Complete-product results compare normal off with the routed candidate. They include the extra finalizer request.

Isolated results compare both finalizers from one locked source context. Only the candidate contract differs.

| Comparison | Pairs | Mean delta | Upper 95% |
| --- | ---: | ---: | ---: |
| Complete-product tokens | 35 | +108341.8 | +124711.3 |
| Complete-product latency ms | 35 | +6456.8 | +7224.4 |
| Isolated finalizer tokens | 35 | -169.8 | -109.1 |
| Isolated output tokens | 35 | -202.8 | -142.1 |
| Isolated finalizer latency ms | 35 | -1631.2 | -833.4 |

The minimal candidate contract adds exactly 33 provider-reported tokens under matched context.

| Eligible outcome | Count |
| --- | ---: |
| Tasks | 7 |
| Normal-off tasks passed | 4 |
| Candidate tasks passed | 5 |
| Critical candidate losses | 1 |
| Unsupported candidate claims | 2 |
| Cache exclusions | 0 |

The isolated finalizer comparison improves tokens and latency. The complete product still adds substantial tokens and latency.
Task success does not pass the strict gate. One critical loss and two unsupported claims also keep release blocked.

## Protected group

Protected tasks bypass candidate prompt construction and every extra finalizer call.
Routed candidate responses reuse the normal-off response bytes.

| Protected outcome | Value |
| --- | ---: |
| Tasks | 7 |
| Candidate injections | 0 |
| Candidate prompt tokens | 0 |
| Extra finalizer calls | 0 |
| Response hashes match | yes |
| Task success matches | yes |
| Protected content complete | no |

Routing works, but protected content is incomplete in the normal-off outputs. That gate fails.

## Process accounting

| Process group | Count |
| --- | ---: |
| Planned total | 165 |
| Base | 46 |
| Finalizer | 84 |
| Judge | 35 |
| Overrun | no |

Judge usage remains outside primary token and latency totals.

## Release gates

| Gate | Outcome |
| --- | --- |
| completeProductTokens | FAIL |
| completeProductLatency | FAIL |
| taskSuccessNonInferior | FAIL |
| zeroCriticalFinalizerLosses | FAIL |
| zeroUnsupportedClaims | FAIL |
| protectedInjectionZero | PASS |
| protectedSuccessEqual | PASS |
| protectedContentComplete | FAIL |
| protectedNoExtraFinalizerWork | PASS |

Final decision: keep mode `off`. Do not enable or release shared-prefix v12.
