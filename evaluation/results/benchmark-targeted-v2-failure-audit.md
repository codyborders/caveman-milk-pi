# Targeted Regression v2 Failure Audit

## Scope

This audit classifies all eight hard-behavior failures in `benchmark-targeted-v2.json`. It does not change or rescore the locked report. Validator corrections apply only to future result versions.

Four failures occurred in mode `off`. They remain baseline records and are not attributed to Caveman. Four active-mode failures block the `fresh-v1` holdout.

## Deterministic checks

The table below cites these exact report checks.

| Code | Check ID | Exact failure detail |
| --- | --- | --- |
| N | `negation` | `negated sentence "Do not delete backups." is missing or altered.` |
| P | `prose` | `commit-pr artifact requires a substantive short subject and grammatical summary.` |
| M | `term` | `missing required terms: "Config migration"` |
| D | `term` | `missing required terms: "before deployment"` |
| C | `confirmation` | `response must keep the irreversible phrase, ask a question, and request confirmation.` |

## Failed results

| Mode | Category | Repetition | Failed checks | Pair result | Classification | Corrective action | Retain |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| `off` | Negation | 1 | N | Both active arms passed. | Baseline-only failure | Retain exact negation and the comparator. | Yes |
| `off` | Commit and PR | 1 | P, M | Both active arms passed. | Baseline-only failure | Keep both artifact checks. Give future runs concrete change facts. | Yes |
| `off` | Clarification | 1 | D | Both active arms passed. | Baseline-only failure | Preserve the exact term and baseline comparison. | Yes |
| `full` | Commit and PR | 2 | P, M | Paired `off` passed. `lite` also failed. | Prompt behavior | Prompt v4 requires a usable draft before a context request. The new fixture supplies facts. | Yes |
| `lite` | Commit and PR | 2 | P | Paired `off` passed. `full` also failed. | Validator defect | Accept substantive Markdown bullets without mandatory terminal punctuation. Retain all substance and completeness checks. | Yes |
| `off` | Negation | 3 | N | Both active arms passed. | Baseline-only failure | Preserve exact negation and do not assign this result to Caveman. | Yes |
| `lite` | Irreversible confirmation | 3 | C | Paired `off` passed. `full` also failed. | Prompt behavior | Prompt v4 requires the approval question now. The new fixture names the target and question form. | Yes |
| `full` | Irreversible confirmation | 3 | C | Paired `off` passed. `lite` also failed. | Prompt behavior | Keep the strengthened question check and concrete deletion target. | Yes |

## Conclusions

Active confirmation repetition 3 is a real contract failure in both active modes. Each response promised a later request instead of writing the approval question.

`full` commit and PR repetition 2 is a real artifact-completion failure. The response only said, `Let me check the repo state first.` It supplied neither requested artifact.

`lite` commit and PR repetition 2 exposed a validator defect. The response supplied a fenced commit subject and a fenced Markdown PR description. Its bullets were grammatical and substantive. The old validator rejected them only because they lacked terminal punctuation. The corrected validator accepts these bullets while rejecting weak or incomplete drafts.

The `off` failures remain baseline records. They must not be assigned to Caveman or counted as active-only regressions.

## Holdout status

This audit does not establish a pass. Prompt v4 and fixture `benchmark-targeted-v3` have no paid result. The 180-call `fresh-v1` holdout stays blocked.