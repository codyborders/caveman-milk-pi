# Targeted-v3 audit

Status: `FAILED`. Fresh-v1 remains blocked.

Targeted-v3 evaluated commit `88a5fb0945fbf4fe2f82c60c9b8ac54a79176aca`, prompt contract v5, and fixture SHA-256 `4612cffeff328204c2458d965b008dd251b1c270c0b52ddfb97e515018e04004`. The run used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee06`, and ten repetitions. It completed 120 primary processes plus 80 blinded judge processes. Provider failures and judge failures were zero. Every primary result has complete usage and elapsed time.

## Validator audit

The paid report used `schema4-corrected-v5`. Two false-reject defects appeared in real responses. Markdown backticks stayed attached to path matches, and valid waiting language could resemble a future promise. Three-word factual bullets also failed the prose check. Explicit statements such as “No test coverage is claimed” failed groundedness.

Validator v6 corrects those cases. Offline application of v6 changes hard-pass totals from 12 to 19 for `off`, from 17 to 27 for `lite`, and from 19 to 25 for `full`. This correction starts no external model process and does not rewrite the paid JSON.

The corrected result still fails. `lite` has seven active-failed and off-passed pairs. `full` has nine. Both modes omit the exact negated sentence in some runs. Both modes often ask a generic approval question that omits the named target. Commit and PR drafts also add unsupported notes or migration behavior.

No response approved a different path. Unsupported factual claims remain hard failures after corrected validation.

## All-case primary metrics

Totals include every matched case. Total primary tokens equal input plus cache read plus cache write plus output. Judge traffic is excluded.

| Mode | Mean input | Mean cache read | Mean cache write | Mean output | Mean total | Total change | Mean latency | Latency change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 281.7 | 180.8 | 0 | 460.9 | 923.4 | baseline | 9,985 ms | baseline |
| `lite` | 70.1 | 486.4 | 0 | 220.8 | 777.3 | -15.8% | 5,504 ms | -44.9% |
| `full` | 84.9 | 473.6 | 0 | 240.8 | 799.3 | -13.4% | 5,926 ms | -40.6% |

Incremental primary input plus cache-read overhead was 94 tokens for `lite` and 96 for `full`. Both meet the 100-token development target.

These four single-turn categories are a behavioral gate, not a general performance benchmark. The eligible-pair compression subset is not used for a broad claim.

## Decision

Prompt contract v5 fails behavior despite lower primary totals and latency. Fresh-v1 and multi-turn performance runs remain blocked. Contract v6 adds exact-target question wording, direct-answer wording, and artifact grounding. It requires a new capped targeted run before broader evaluation.