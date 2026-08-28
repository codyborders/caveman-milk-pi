# Caveman Milk Real-Pi Pilot

## Decision

The pilot failed its release gates. The full five-repetition evaluation did not run. Mode `off` remains the recommended default.

Both active modes reduced total output tokens. Neither active mode reduced primary response cost. Eight active responses also lost judge quality.

## Scope

The formal pilot ran from commit `fbc34b2f6898c8037d112f6f8b8835d249f71322`. Pi version `0.84.3` loaded the branch extension for every case.

The primary model was `openai-codex/gpt-5.4-mini`. The blinded judge used `openai-codex/gpt-5.6-sol`. Both models used Pi OAuth subscription access.

Pi reported per-request token usage and model-catalog cost. These values do not represent a separate API invoice. The pricing record date is 2026-08-28.

The pilot compared `off`, `lite`, and `full`. It used all 15 committed categories with three repetitions. Arm order used seed `0xc0ffee02`.

The runtime prompt hash was `03edd1eb4baa46467645a0a0607f0066951043a444763b43138843f681f108f8`. The contract hash was `c59769742e305985e772eb5fa4b34931cd644ed09e908cfe7abccbff9c2ab8e6`.

## Attempt controls

The formal pilot reserved 135 primary processes and 90 judge processes. Its cumulative cap was 225. The run completed with exactly 225 counted attempts.

Every arm reported positive input and output usage. Raw usage was present on every result. No comparison converted missing usage to zero.

Earlier checks found evaluation runner defects before the final pilot. Four Pi launches stopped before model execution. An incomplete trial used 31 model processes before cumulative checkpoint accounting was added.

A 15-attempt preflight verified complete usage and matching prompt hashes. It also verified validator output plus judge records. A separate 15-attempt run verified real tool-call validation.

## Aggregate results

| Mode | Cases | Output tokens | Output change | Input tokens | Primary cost | Cost change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` | 45 | 10,823 | baseline | 26,064 | $0.075394 | baseline |
| `lite` | 45 | 9,572 | -11.56% | 48,396 | $0.084325 | +11.85% |
| `full` | 45 | 9,608 | -11.23% | 42,384 | $0.078211 | +3.74% |

Paired output ratios tell a less favorable story. `lite` had a mean ratio of 1.015 and a median of 0.953. `full` had a mean ratio of 1.016 and a median of 0.952.

The total-output reduction came from high-volume cases. Many individual pairs became longer, so both strict per-case brevity gates failed.

| Mode | Passed cases | Validator passes | Brevity passes | Judge-quality passes |
| --- | ---: | ---: | ---: | ---: |
| `off` | 35/45 | 35/45 | 45/45 | 45/45 |
| `lite` | 16/45 | 35/45 | 20/45 | 42/45 |
| `full` | 10/45 | 35/45 | 16/45 | 40/45 |

The raw formal report contains nine false tool-validator failures. The runner captured those tool calls but did not pass them into validation. Commit `4901ea0` fixed that wiring.

The post-fix tool run validated all nine tool calls. Four of six active tool cases still failed brevity, so the pilot decision does not depend on the false validator failures.

## Manual review

Manual review confirmed several material quality losses.

| Case | Finding |
| --- | --- |
| `negation`, `lite`, repetition 1 | The response added an unsupported retention exception and weakened the prohibition. |
| `code-generation`, `full`, repetition 1 | The generated documentation used a sentence fragment. |
| `clarification`, `full`, repetition 1 | The response changed rollback timing instead of only clarifying it. |
| `wenyan-english`, both active modes | Responses sometimes weakened the required request-timeout instruction. |
| `commit-pr`, `full`, repetition 3 | The response changed the requested configuration-migration topic. |
| `irreversible-confirmation`, active runs | Required confirmation language was absent in several outputs. |
| `tutorial`, active runs | Multiple outputs violated the exact paragraph count. |

The active modes performed well on ordered migration and code brevity. Those wins did not offset broader failures.

## Evaluation corrections made during the pilot

The evaluation branch now closes Pi stdin before execution. It reports signal termination and provider errors directly.

Attempt reservations persist before every counted action. Resumed runs enforce one cumulative cap and reuse completed count requests.

Tool-only Pi responses are accepted. Captured tool calls now reach deterministic validators. Pi-based judging uses isolated mode-off processes.

## Next steps

Another agent should review the raw report and evaluation code changes in this branch. It should decide whether prompt rules or brevity thresholds need revision.

Any revised candidate should repeat the three-repetition pilot first. A five-repetition full evaluation should run only after every pilot gate passes.
