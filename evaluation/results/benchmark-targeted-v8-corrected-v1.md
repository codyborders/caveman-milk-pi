# Targeted-v8 corrected rescore (v1)

This derived report recomputes targeted-v8 validation without changing measured fields. It made 0 external model calls.

| Item | Value |
| --- | --- |
| Generator | `scripts/eval/targeted-v8-correction.mjs` |
| Source report | `evaluation/results/benchmark-targeted-v8.json` |
| Source report SHA-256 | `df96aad18cccb62eeb5bc8f70c93c464f090bad76deabc08ed4b9ca96e05069b` |
| Run ID | `caveman-eval-1399f308e6f20515` |
| Source fixture | `scripts/evaluation-fixtures-targeted-v4.json` |
| Source fixture SHA-256 | `c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de` |
| Original validator | `schema4-corrected-v10` |
| Corrected validator | `schema4-corrected-v12` |

Measured responses, usage, timing, word counts, judge results, and compression policies are unchanged.

## Validator changes

| Change | Version | Outcome effect | Operation |
| --- | --- | --- | --- |
| `soft-wrapped-commit-pr-prose-joined-before-supplied-facts` | schema4-corrected-v11 | changed validation | descriptionContentLines joins consecutive soft-wrapped description lines into one content line before incomplete-line, complete-line, and supplied-facts checks run, so a wrapped sentence is no longer read as telegraphic fragments. |
| `supplied-facts-pass-through-false-positive-removed` | schema4-corrected-v12 | none | The supplied-facts test-claim pattern dropped the bare 'pass' word forms, which had flagged pass-through prose as a test-result claim. |

The effective correction joins soft-wrapped commit and PR prose before structure and supplied-fact checks. The v12 pass-through change affects no targeted-v8 outcome.

## Recomputed hard passes

| Mode | Hard passes |
| --- | --- |
| `off` | 37/40 |
| `lite` | 40/40 |
| `full` | 40/40 |

Both active modes reach 40/40. Mode `off` remains at 37/40. Its three failed approval questions omit the exact target.

## Changed outcomes (4 of 120)

| Raw pointer | Key | Mode | Category | Repetition | Response SHA-256 prefix | Original failed checks | Recomputed failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /results/32 | `3::commit-pr::full` | full | commit-pr | r3 | 97aa3206c10fa2f8... | prose | none |
| /results/42 | `4::commit-pr::off` | off | commit-pr | r4 | 3df31b99802fef57... | prose, supplied-facts | none |
| /results/66 | `6::commit-pr::lite` | lite | commit-pr | r6 | 5b550e1797af6cb8... | prose, supplied-facts | none |
| /results/115 | `10::commit-pr::off` | off | commit-pr | r10 | 4869d516745853be... | prose, supplied-facts | none |

Each row identifies the unchanged raw response by JSON pointer and response hash.
