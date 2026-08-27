# Caveman Milk Pi — Blinded Quality Judge Rubric

Scores run 0 to 4 on two axes for each blinded response. The judge sees the
original task prompt, Response A, and Response B. The judge never learns which
caveman mode produced either response.

## Completeness

| Score | Meaning |
| --- | --- |
| 4 | Every requested element is present and answered. |
| 3 | One minor omission that does not reduce usefulness. |
| 2 | A required element is missing, truncated, or wrong. |
| 1 | The response attempts the task but misses most requested output. |
| 0 | The response does not address the task. |

## Technical correctness

| Score | Meaning |
| --- | --- |
| 4 | Fully correct, including exact values and requested term usage. |
| 3 | Correct except for one trivial inaccuracy. |
| 2 | A real technical error, a reversed negation, or wrong step order. |
| 1 | Multiple technical errors. |
| 0 | Fundamentally wrong output. |

## Required deductions

Apply these before assigning scores.

- Remove one correctness point if an exact negation is removed or softened.
- Remove one correctness point if exact values, identifiers, or quoted errors
  change in any way.
- Remove one correctness point if numbered steps reorder, skip, or repeat.
- Remove one correctness point if requested code does not parse, or if a
  requested function is absent.
- Remove one completeness point if a requested warning, confirmation phrase,
  or heading is missing.
- Remove one completeness point if the requested paragraph or step count is
  wrong.

## Neutrality rules

- Never reward shortness. Never punish shortness.
- Never reward length. Never punish length.
- Judge only the content against the task prompt.
- Style and formatting do not change scores unless the task requests them.

## Verdict format

The judge must return one JSON object and nothing else:

```json
{
  "completeness": { "A": 0, "B": 0 },
  "correctness": { "A": 0, "B": 0 },
  "notes": "one short sentence on the decisive difference"
}
```

A response that cannot be parsed as this object counts as a judge failure.
Judge failure fails the evaluation pair.
